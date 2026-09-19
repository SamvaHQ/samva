import { strict as assert } from "node:assert";

import { createClient } from "samva";
import { generateWebhookSecret, signWebhook } from "samva/webhooks";
import { test } from "vitest";

import { configureInboundEmail, handleInboundReply } from "../src/inbound";

const DOMAIN_INPUT = {
  domainId: "domain_01",
  domain: "example.com",
  webhookUrl: "https://app.example.com/webhooks/samva",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const createHarness = (
  options: {
    readonly existingEndpoints?: ReadonlyArray<{ id: string; name: string }>;
    readonly failingSends?: number;
  } = {},
) => {
  const requests: Array<{
    method: string;
    path: string;
    body: unknown;
    headers: Record<string, string>;
  }> = [];
  let remainingSendFailures = options.failingSends ?? 0;

  const fetchMock = Object.assign(
    async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      const raw = request.method === "GET" ? "" : await request.clone().text();
      const body = raw.length > 0 ? (JSON.parse(raw) as unknown) : undefined;
      requests.push({
        method: request.method,
        path: url.pathname,
        body,
        headers: Object.fromEntries(request.headers),
      });

      if (request.method === "GET" && url.pathname === "/v1/webhooks") {
        const items = options.existingEndpoints ?? [];
        return json({
          items,
          pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/webhooks") {
        return json({ endpoint: { id: "webhook_01" }, secret: "whsec_example" }, 201);
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/v1/webhooks/")) {
        return json({
          id: url.pathname.split("/").at(-1),
          name: "Inbound replies",
          url: "https://app.example.com/webhooks/samva",
          eventTypes: ["message.received"],
          channels: ["email"],
          status: "active",
        });
      }
      if (url.pathname.endsWith("/receiving")) {
        return json({
          success: true,
          ruleName: "inbound-replies",
          recipients: ["support@example.com"],
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/messages") {
        if (remainingSendFailures > 0) {
          remainingSendFailures -= 1;
          return json({ error: "temporary failure" }, 500);
        }
        return json({ id: "msg_reply", status: "queued" }, 201);
      }
      if (url.pathname.endsWith("/messages")) {
        return json({ items: [], pagination: { hasMore: false } });
      }
      return json({ id: "conv_01", status: "active" });
    },
    { preconnect: () => {} },
  );

  const samva = createClient({
    apiKey: "samva_sk_test_example",
    baseUrl: "https://api.example.test",
    fetch: fetchMock,
  });

  return { samva, requests };
};

const signedRequest = async (secret: string, data: Record<string, unknown>) => {
  const body = JSON.stringify({
    type: "message.received",
    timestamp: "2026-09-19T12:00:00.000Z",
    data,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signWebhook({ body, id: "whevt_event_01", timestamp, secret });
  return new Request("https://app.example.com/webhooks/samva", {
    method: "POST",
    body,
    headers: {
      "webhook-id": "whevt_event_01",
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    },
  });
};

const replyData = (overrides: Record<string, unknown> = {}) => ({
  messageId: "msg_inbound",
  conversationId: "conv_01",
  from: "ada@example.com",
  subject: "Question",
  ...overrides,
});

test("configures inbound receiving and replies from a verified conversation", async () => {
  const { samva, requests } = createHarness();

  await configureInboundEmail(samva, DOMAIN_INPUT);

  const secret = generateWebhookSecret();
  const processedWebhookIds = new Set<string>();
  const result = await handleInboundReply(await signedRequest(secret, replyData()), {
    samva,
    webhookSecret: secret,
    processedWebhookIds,
  });

  assert.equal(result.accepted, true);
  assert.equal(processedWebhookIds.size, 1);
  assert.deepEqual(requests[1]?.body, {
    name: "Inbound replies",
    url: "https://app.example.com/webhooks/samva",
    eventTypes: ["message.received"],
    channels: ["email"],
  });
  assert.deepEqual(requests[2]?.body, {
    domain: "example.com",
    catchAll: true,
    endpointId: "webhook_01",
  });
  assert.deepEqual(
    requests.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /v1/webhooks",
      "POST /v1/webhooks",
      "POST /v1/email/domains/domain_01/receiving",
      "GET /v1/conversations/conv_01",
      "GET /v1/conversations/conv_01/messages",
      "POST /v1/messages",
    ],
  );
  assert.deepEqual(requests.at(-1)?.body, {
    conversationId: "conv_01",
    channel: "email",
    to: [{ email: "ada@example.com" }],
    email: {
      subject: "Re: Question",
      html: "<p>Thanks for your reply. We will follow up shortly.</p>",
      inReplyToMessageId: "msg_inbound",
    },
  });
  assert.equal(requests.at(-1)?.headers["idempotency-key"], "whevt_event_01");
});

test("reuses and reconciles an endpoint from a partial run instead of creating a second one", async () => {
  const { samva, requests } = createHarness({
    existingEndpoints: [{ id: "webhook_existing", name: "Inbound replies" }],
  });

  const configured = await configureInboundEmail(samva, DOMAIN_INPUT);
  assert.equal(configured.endpoint.secret, null);

  assert.deepEqual(
    requests.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /v1/webhooks",
      "PATCH /v1/webhooks/webhook_existing",
      "POST /v1/email/domains/domain_01/receiving",
    ],
  );
  assert.deepEqual(requests[1]?.body, {
    url: "https://app.example.com/webhooks/samva",
    eventTypes: ["message.received"],
    channels: ["email"],
    status: "active",
  });
  assert.deepEqual(requests[2]?.body, {
    domain: "example.com",
    catchAll: true,
    endpointId: "webhook_existing",
  });
});

test("ignores an auto-reply without reading or sending", async () => {
  const { samva, requests } = createHarness();
  const secret = generateWebhookSecret();

  const result = await handleInboundReply(
    await signedRequest(secret, replyData({ isAutoReply: true })),
    { samva, webhookSecret: secret, processedWebhookIds: new Set() },
  );

  assert.deepEqual(result, { accepted: false, reason: "auto-reply" });
  assert.equal(requests.length, 0);
});

test("replies to a subjectless message with a fallback subject", async () => {
  const { samva, requests } = createHarness();
  const secret = generateWebhookSecret();
  const { subject: _subject, ...withoutSubject } = replyData();

  const result = await handleInboundReply(await signedRequest(secret, withoutSubject), {
    samva,
    webhookSecret: secret,
    processedWebhookIds: new Set(),
  });

  assert.equal(result.accepted, true);
  const last = requests.at(-1);
  assert.ok(last);
  assert.equal((last.body as { email: { subject: string } }).email.subject, "Re: your message");
});

test("leaves a failed reply unprocessed so a retry can complete it", async () => {
  const { samva } = createHarness({ failingSends: 1 });
  const secret = generateWebhookSecret();
  const processedWebhookIds = new Set<string>();

  await assert.rejects(
    handleInboundReply(await signedRequest(secret, replyData()), {
      samva,
      webhookSecret: secret,
      processedWebhookIds,
    }),
  );
  assert.equal(processedWebhookIds.size, 0);

  const retry = await handleInboundReply(await signedRequest(secret, replyData()), {
    samva,
    webhookSecret: secret,
    processedWebhookIds,
  });
  assert.equal(retry.accepted, true);
  assert.equal(processedWebhookIds.size, 1);
});

test("rejects a webhook whose signature does not match the secret", async () => {
  const samva = createClient({
    apiKey: "samva_sk_test_example",
    baseUrl: "https://api.example.test",
    fetch: Object.assign(
      async () => {
        throw new Error("no request should be made for an unverified webhook");
      },
      { preconnect: () => {} },
    ),
  });

  await assert.rejects(
    handleInboundReply(await signedRequest(generateWebhookSecret(), replyData()), {
      samva,
      webhookSecret: generateWebhookSecret(),
      processedWebhookIds: new Set(),
    }),
  );
});

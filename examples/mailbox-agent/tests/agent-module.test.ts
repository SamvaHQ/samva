import { strict as assert } from "node:assert";

import { createClient } from "samva";
import type { AgentContext, AgentEvent } from "samva/agent";
import { createTestClient, runAgent } from "samva/agent/test";
import { test } from "vitest";

import agent from "../src/agent-module";

const mailboxEvent = (data: unknown): AgentEvent => ({
  id: "evt_01",
  type: "mailbox.message.received",
  timestamp: "2026-10-10T12:00:00.000Z",
  data,
});

/** Fake per-call authority: the client, a log collector, and no integrations or memory. */
const context = (samva: AgentContext["samva"]) => {
  const logs: string[] = [];
  const ctx: AgentContext = {
    capability: {
      callId: "call_01",
      organizationId: "org_0000000000000000",
      agentId: "agt_0000000000000000",
      versionId: "agtv_0000000000000000",
      bundleSha256: "a".repeat(64),
      expiresAt: 1_800_000_000_000,
      trigger: {
        kind: "event",
        eventId: "evt_01",
        eventType: "mailbox.message.received",
        attempt: 1,
      },
    },
    samva,
    connections: {
      async call() {
        throw new Error("Event handlers have no integration authority");
      },
    },
    memory: {
      async search() {
        throw new Error("Event handlers have no memory authority");
      },
      async remember() {
        throw new Error("Event handlers have no memory authority");
      },
    },
    log: (...values) => logs.push(values.join(" ")),
  };
  return { ctx, logs };
};

const receivedEvent = (from = "ada@example.com") =>
  mailboxEvent({
    mailboxId: "mbx_01",
    message: {
      id: "msg_01",
      threadId: "thr_01",
      from: { address: from },
      to: ["support@acme.samva.email"],
      cc: [],
      subject: "Invoice question",
      text: "Where is my invoice?",
      replyText: null,
      attachments: [],
      occurredAt: "2026-10-10T12:00:00.000Z",
    },
  });

test("registers one handler, for received mail", () => {
  assert.deepEqual(Object.keys(agent.events), ["mailbox.message.received"]);
});

test("replies to the received message", async () => {
  const client = createTestClient({
    "POST /v1/mailboxes/mbx_01/messages/msg_01/reply": {
      actionId: "mbxact_01",
      state: "approvalRequired",
      messageId: null,
      acceptedAt: null,
    },
  });

  const { ctx, logs } = context(client);

  await runAgent(agent, ctx).event(receivedEvent());

  assert.equal(client.calls.length, 1);
  const [call] = client.calls;
  assert.equal(call?.method, "POST");
  assert.equal(call?.path, "/v1/mailboxes/mbx_01/messages/msg_01/reply");
  assert.deepEqual(logs, ["approvalRequired mbxact_01"]);
});

test("does not reply to an automated sender", async () => {
  const client = createTestClient();
  const { ctx } = context(client);

  await runAgent(agent, ctx).event(receivedEvent("no-reply@example.com"));

  assert.equal(client.calls.length, 0);
});

test("logs a queued reply without reporting a sent message", async () => {
  const client = createTestClient({
    "POST /v1/mailboxes/mbx_01/messages/msg_01/reply": {
      actionId: "mbxact_01",
      state: "queued",
      messageId: null,
      acceptedAt: null,
      problem: {
        code: "rateLimited",
        message: "Wait for rate capacity",
        error: {
          _tag: "RateLimitedError",
          message: "Wait for rate capacity",
          retryAfterSeconds: 10,
        },
      },
    },
  });
  const { ctx, logs } = context(client);

  await runAgent(agent, ctx).event(receivedEvent());

  assert.deepEqual(
    client.calls.map(({ method, path }) => ({ method, path })),
    [{ method: "POST", path: "/v1/mailboxes/mbx_01/messages/msg_01/reply" }],
  );
  assert.deepEqual(logs, ["queued mbxact_01"]);
});

test("skips a WhatsApp reply when the service window has closed, without retrying the event", async () => {
  const event = mailboxEvent({
    mailboxId: "mbx_01",
    message: {
      ...(receivedEvent().data as { message: object }).message,
      channel: "whatsapp",
      from: { address: "+16175559876" },
      subject: null,
      text: "Has my order shipped?",
    },
  });
  // The API refuses free-form text outside the window with this 422 body.
  const client = createClient({
    apiKey: "samva_sk_test_mailbox_agent",
    baseUrl: "https://api.samva.test",
    fetch: Object.assign(
      async () =>
        Response.json(
          {
            _tag: "WhatsAppServiceWindowClosedError",
            message: "The 24-hour service window closed.",
            closedAt: "2026-10-16T09:12:00.000Z",
          },
          { status: 422 },
        ),
      { preconnect: () => {} },
    ),
  });

  const { ctx, logs } = context(client);

  await runAgent(agent, ctx).event(event);

  assert.deepEqual(logs, ["skipped msg_01 service window closed"]);
});

import { createMemoryState } from "@chat-adapter/state-memory";
import { generateWebhookSecret, signWebhook } from "@samva/webhooks";
import { expect, it, vi } from "vitest";

import extension from "../extension/extension";

const secret = generateWebhookSecret();
const mailboxId = "mbx_0000000000000000";
const threadId = "thread_0000000000000000";

async function signedEmail(id: string, from: string, text = "Thanks") {
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({
    type: "mailbox.message.received",
    timestamp: occurredAt,
    data: {
      mailboxId,
      namespaceId: null,
      thread: { id: threadId, subject: "Cancel order 1042", preview: null },
      message: {
        id: "msg_0000000000000000",
        threadId,
        channel: "email",
        from: { address: from },
        to: [],
        cc: [],
        subject: "Cancel order 1042",
        text,
        replyText: null,
        attachments: [],
        occurredAt,
      },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://example.com/eve/v1/samva", {
    method: "POST",
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": await signWebhook({ body, id, timestamp, secret }),
    },
  });
}

function unused(): never {
  throw new Error("Unexpected Eve fixture operation");
}

it("skips automated email and starts a turn with the subject and body for customer mail", async () => {
  extension({ apiKey: "test", mailboxId, webhook: { secret, state: createMemoryState() } });
  const { default: channel } = await import("../extension/channels/samva");
  const route = channel.routes.find(
    (candidate) => candidate.method === "POST" && candidate.path === "/eve/v1/samva",
  );
  if (route?.method !== "POST") throw new Error("Expected the Samva webhook route");

  const send = vi.fn(async (_message: unknown, _options: unknown) => ({
    sessionId: "session",
    deliveryId: "delivery",
    stream: unused,
    result: unused,
  }));
  const pending: Promise<unknown>[] = [];
  const args = {
    from: (address: string) => {
      expect(address).toBe(`samva:${mailboxId}:${threadId}`);
      return {
        send,
        create: unused,
        respond: unused,
        cancel: unused,
        compact: unused,
        clear: unused,
        end: unused,
      };
    },
    resolveSession: unused,
    attachSession: unused,
    to: unused,
    waitUntil: (task: Promise<unknown>) => {
      pending.push(task);
    },
    params: {},
    requestIp: null,
    describe: unused,
    listSkillFiles: unused,
    readSkill: unused,
    invokeTool: unused,
  };
  expect(
    (await route.handler(await signedEmail("evt_auto", "mailer-daemon@example.com"), args))?.status,
  ).toBe(204);
  expect(pending).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();

  expect(
    (await route.handler(await signedEmail("evt_customer", "customer@example.com"), args))?.status,
  ).toBe(204);
  await Promise.all(pending);
  expect(send).toHaveBeenCalledExactlyOnceWith(
    "Subject: Cancel order 1042\n\nThanks",
    expect.objectContaining({ idempotencyKey: "evt_customer", turnPolicy: "queue" }),
  );
});

it("starts the turn from the full body when the webhook preview is capped", async () => {
  const full = `${"x".repeat(32_000)} tail`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ id: "msg_0000000000000000", subject: "Cancel order 1042", text: full }),
    ),
  );
  extension({ apiKey: "test", mailboxId, webhook: { secret, state: createMemoryState() } });
  const { default: channel } = await import("../extension/channels/samva");
  const route = channel.routes.find(
    (candidate) => candidate.method === "POST" && candidate.path === "/eve/v1/samva",
  );
  if (route?.method !== "POST") throw new Error("Expected the Samva webhook route");

  const send = vi.fn(async (_message: unknown, _options: unknown) => ({
    sessionId: "session",
    deliveryId: "delivery",
    stream: unused,
    result: unused,
  }));
  const pending: Promise<unknown>[] = [];
  const args = {
    from: () => ({
      send,
      create: unused,
      respond: unused,
      cancel: unused,
      compact: unused,
      clear: unused,
      end: unused,
    }),
    resolveSession: unused,
    attachSession: unused,
    to: unused,
    waitUntil: (task: Promise<unknown>) => {
      pending.push(task);
    },
    params: {},
    requestIp: null,
    describe: unused,
    listSkillFiles: unused,
    readSkill: unused,
    invokeTool: unused,
  };
  const request = await signedEmail("evt_long", "customer@example.com", "x".repeat(32_000));
  expect((await route.handler(request, args))?.status).toBe(204);
  await Promise.all(pending);
  vi.unstubAllGlobals();
  expect(send).toHaveBeenCalledExactlyOnceWith(
    `Subject: Cancel order 1042\n\n${full}`,
    expect.objectContaining({ idempotencyKey: "evt_long" }),
  );
});

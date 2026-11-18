import { createMemoryState } from "@chat-adapter/state-memory";
import { generateWebhookSecret, signWebhook } from "@samva/webhooks";
import { Chat, NotImplementedError, type Message } from "chat";
import { afterEach, expect, it, vi } from "vitest";

import { createSamvaAdapter, receiptOf } from "../src/index";

const secret = generateWebhookSecret();
const mailboxId = "mbx_0000000000000000";
const threadId = "samva:mbx_0000000000000000:thread_0000000000000000";
const held = {
  state: "approvalRequired",
  actionId: "action_1",
  messageId: null,
  threadId: null,
};

async function delivery({
  mailbox = mailboxId,
  key = secret,
  channel = "whatsapp",
  id = "evt_1",
}: { mailbox?: string; key?: string; channel?: "email" | "whatsapp"; id?: string } = {}) {
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({
    type: "mailbox.message.received",
    timestamp: occurredAt,
    data: {
      mailboxId: mailbox,
      namespaceId: null,
      thread: { id: "thread_0000000000000000", subject: null, preview: null },
      message: {
        id: "msg_0000000000000000",
        channel,
        threadId: "thread_0000000000000000",
        from: { address: channel === "whatsapp" ? "+15555550100" : "customer@example.com" },
        to: [],
        cc: [],
        subject: null,
        text: "Hello",
        replyText: null,
        attachments: [],
        occurredAt,
      },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://example.com/samva", {
    method: "POST",
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": await signWebhook({ body, id, timestamp, secret: key }),
    },
  });
}

function setup() {
  const adapter = createSamvaAdapter({ apiKey: "test", mailboxId, webhookSecret: secret });
  const chat = new Chat({
    userName: "Samva",
    adapters: { samva: adapter },
    state: createMemoryState(),
  });
  return { adapter, chat };
}

afterEach(() => vi.unstubAllGlobals());

it("rejects an invalid signature and ignores a different mailbox", async () => {
  const { chat } = setup();
  const processMessage = vi.spyOn(chat, "processMessage");
  expect((await chat.webhooks.samva(await delivery({ key: generateWebhookSecret() }))).status).toBe(
    401,
  );
  expect(
    (await chat.webhooks.samva(await delivery({ mailbox: "mbx_1111111111111111" }))).status,
  ).toBe(204);
  expect(processMessage).not.toHaveBeenCalled();
});

it.each(["email", "whatsapp"] as const)("dispatches a signed %s delivery once", async (channel) => {
  const { adapter, chat } = setup();
  const processMessage = vi
    .spyOn(chat, "processMessage")
    .mockImplementation(async (_adapter, id, message) => {
      expect(id).toBe(threadId);
      expect(message).toMatchObject({ text: "Hello", raw: { eventId: "evt_1" } });
      expect(adapter.isDM(id)).toBe(channel === "whatsapp");
      await Promise.resolve();
    });
  const requests = await Promise.all([delivery({ channel }), delivery({ channel })]);
  await Promise.all(
    requests.map(async (request) => {
      expect((await chat.webhooks.samva(request)).status).toBe(204);
    }),
  );
  expect(processMessage).toHaveBeenCalledTimes(1);
});

it("buffers a stream and posts one reply with a deterministic key and a held action ID", async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.headers.get("idempotency-key")).toBe("reply:msg_0000000000000000");
    expect(await request.json()).toEqual({ channel: "whatsapp", text: "Hello there" });
    expect(new URL(request.url).pathname).toBe(
      "/v1/mailboxes/mbx_0000000000000000/messages/msg_0000000000000000/reply",
    );
    return Response.json(held, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  const { adapter, chat } = setup();
  vi.spyOn(chat, "processMessage").mockImplementation(async (_adapter, id) => {
    async function* chunks() {
      yield "Hello";
      yield " there";
    }
    const posted = await adapter.stream(id, chunks());
    expect(posted).toEqual({ id: "action_1", threadId, raw: held });
    expect(receiptOf(posted)?.state).toBe("approvalRequired");
  });
  expect((await chat.webhooks.samva(await delivery())).status).toBe(204);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("feeds a verified message through the real Chat handler", async () => {
  const { chat } = setup();
  const observed: Message[] = [];
  chat.onDirectMessage(async (_thread, message) => {
    expect(_thread.isDM).toBe(true);
    expect(message.text).toBe("Hello");
    observed.push(message);
  });
  expect((await chat.webhooks.samva(await delivery())).status).toBe(204);
  expect(observed).toHaveLength(1);
});

it("uses sendMessage for a new WhatsApp conversation", async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(new URL(request.url).pathname).toBe("/v1/mailboxes/mbx_0000000000000000/messages");
    expect(await request.json()).toEqual({
      channel: "whatsapp",
      to: "+15555550100",
      text: "Hello",
    });
    return Response.json(held, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  const { adapter } = setup();
  const id = await adapter.openDM("+15555550100");
  expect(receiptOf(await adapter.postMessage(id, "Hello"))).toEqual(held);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("uses Chat SDK's unsupported error for edits, deletion, and reactions", async () => {
  const { adapter } = setup();
  for (const method of ["editMessage", "deleteMessage", "addReaction", "removeReaction"] as const) {
    await expect(adapter[method]()).rejects.toBeInstanceOf(NotImplementedError);
  }
  await expect(adapter.startTyping()).resolves.toBeUndefined();
});

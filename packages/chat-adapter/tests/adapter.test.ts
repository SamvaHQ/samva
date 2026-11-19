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
  acceptedAt: null,
  draftId: null,
  executeUntil: null,
  retryAt: null,
  problem: null,
  retryEligible: false,
  decision: null,
  waitReason: null,
  reviewExpectedAt: null,
  skippedRecipients: [],
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

async function delivery({
  mailbox = mailboxId,
  key = secret,
  channel = "whatsapp",
  id = "evt_1",
  from,
  headerFields,
  subject = null,
  text = "Hello",
  replyText = null,
}: {
  mailbox?: string;
  key?: string;
  channel?: "email" | "whatsapp" | null;
  id?: string;
  from?: string;
  headerFields?: Record<string, string | string[]>;
  subject?: string | null;
  text?: string | null;
  replyText?: string | null;
} = {}) {
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
        ...(channel === null ? {} : { channel }),
        threadId: "thread_0000000000000000",
        from: {
          address: from ?? (channel === "whatsapp" ? "+15555550100" : "customer@example.com"),
        },
        headers: headerFields,
        to: [],
        cc: [],
        subject,
        text,
        replyText,
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

function setup(includeAutomatedEmail = false) {
  const adapter = createSamvaAdapter({
    apiKey: "test",
    mailboxId,
    webhookSecret: secret,
    includeAutomatedEmail,
  });
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

it("reads the full body when the webhook preview may be cut, and not otherwise", async () => {
  const full = `${"x".repeat(32_000)} tail`;
  const fetch = vi.fn(async (request: Request) => {
    expect(new URL(request.url).pathname).toBe(
      "/v1/mailboxes/mbx_0000000000000000/messages/msg_0000000000000000",
    );
    return Response.json({ id: "msg_0000000000000000", subject: "Long", text: full });
  });
  vi.stubGlobal("fetch", fetch);
  const { chat } = setup();
  const texts: string[] = [];
  vi.spyOn(chat, "processMessage").mockImplementation(async (_adapter, _id, message) => {
    texts.push((message as Message).text);
    await Promise.resolve();
  });

  expect(
    (
      await chat.webhooks.samva(
        await delivery({ channel: "email", id: "evt_short", subject: "Short", text: "Brief" }),
      )
    ).status,
  ).toBe(204);
  expect(fetch).not.toHaveBeenCalled();

  expect(
    (
      await chat.webhooks.samva(
        await delivery({
          channel: "email",
          id: "evt_long",
          subject: "Long",
          text: "x".repeat(32_000),
        }),
      )
    ).status,
  ).toBe(204);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(texts).toEqual(["Subject: Short\n\nBrief", `Subject: Long\n\n${full}`]);
});

it("fails the webhook so it is retried when the full body cannot be read", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail
        ? new Response("unavailable", { status: 503 })
        : Response.json({ id: "msg_0000000000000000", text: "full" }),
    ),
  );
  const { chat } = setup();
  const processMessage = vi.spyOn(chat, "processMessage").mockResolvedValue();
  const waitUntil = vi.fn();
  const long = () => delivery({ channel: "email", text: "x".repeat(32_000) });

  await expect(chat.webhooks.samva(await long(), { waitUntil })).rejects.toThrow();
  expect(processMessage).not.toHaveBeenCalled();
  expect(waitUntil).not.toHaveBeenCalled();

  fail = false;
  expect((await chat.webhooks.samva(await long(), { waitUntil })).status).toBe(204);
  await Promise.all(waitUntil.mock.calls.map(([task]) => task));
  expect(processMessage).toHaveBeenCalledTimes(1);
});

it("buffers a stream and posts one reply with a deterministic key and a held action ID", async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.headers.get("idempotency-key")).toMatch(
      /^reply:msg_0000000000000000:delivery:[a-f0-9]{64}:0$/,
    );
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

it("finds the latest inbound message across pages for posts outside a webhook", async () => {
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/reply")) {
      expect(url.pathname).toContain("/messages/newest/reply");
      expect(request.headers.get("idempotency-key")).toMatch(/^reply:newest:[a-f0-9]{64}$/);
      return Response.json(held, { status: 202 });
    }

    expect(url.pathname).toBe(
      "/v1/mailboxes/mbx_0000000000000000/threads/thread_0000000000000000/messages",
    );
    return url.searchParams.has("cursor")
      ? Response.json({
          items: [
            { id: "newest", channel: "email", direction: "inbound" },
            { id: "outbound", channel: "email", direction: "outbound" },
          ],
          nextCursor: null,
        })
      : Response.json({
          items: [{ id: "older", channel: "email", direction: "inbound" }],
          nextCursor: "next",
        });
  });
  vi.stubGlobal("fetch", fetch);
  const { adapter } = setup();
  expect(receiptOf(await adapter.postMessage(threadId, "Hello"))).toEqual(held);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it.each(["editMessage", "deleteMessage", "addReaction", "removeReaction"] as const)(
  "uses Chat SDK's unsupported error for %s",
  async (method) => {
    const { adapter } = setup();
    await expect(adapter[method]()).rejects.toBeInstanceOf(NotImplementedError);
  },
);

it("treats typing as a no-op", async () => {
  const { adapter } = setup();
  await expect(adapter.startTyping()).resolves.toBeUndefined();
});

it("reuses the original post across webhook retries and gives later posts their own keys", async () => {
  const accepted = new Map<string, { text: string; receipt: typeof held }>();
  const fetch = vi.fn(async (request: Request) => {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new Error("Expected an idempotency key");
    const { text } = await request.json();
    const previous = accepted.get(key);
    if (previous) {
      expect(text).not.toBe(previous.text);
      return Response.json(
        {
          _tag: "MailboxSendConflictError",
          id: previous.receipt.actionId,
          resource: "MailboxAction",
          message: "This key already has a receipt",
          receipt: previous.receipt,
        },
        { status: 409 },
      );
    }

    const receipt = { ...held, actionId: `action_${accepted.size + 1}` };
    accepted.set(key, { text, receipt });
    if (accepted.size === 1) throw new Error("Lost response after Samva recorded the action");
    return Response.json(receipt, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  const { adapter, chat } = setup();
  const processMessage = vi
    .spyOn(chat, "processMessage")
    .mockImplementationOnce(async (_adapter, id) => {
      await adapter.postMessage(id, "Acknowledged");
    })
    .mockImplementationOnce(async (_adapter, id) => {
      const retried = await adapter.postMessage(id, "Acknowledged again");
      expect(retried.id).toBe("action_1");
      expect(receiptOf(retried)?.state).toBe("approvalRequired");
      expect((await adapter.postMessage(id, "The answer")).id).toBe("action_2");
    });

  await expect(chat.webhooks.samva(await delivery())).rejects.toThrow();
  expect((await chat.webhooks.samva(await delivery())).status).toBe(204);
  expect((await chat.webhooks.samva(await delivery())).status).toBe(204);

  const keys = fetch.mock.calls.map(([request]) => request.headers.get("idempotency-key"));
  expect(keys).toHaveLength(3);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[1]).not.toBe(keys[2]);
  expect(accepted.size).toBe(2);
  expect(processMessage).toHaveBeenCalledTimes(2);
});

it("caches the backward history index and fetches bodies for each requested window", async () => {
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname.includes("/threads/")) {
      expect(url.pathname).toMatch(/\/threads\/[^/]+\/messages$/);
      return url.searchParams.has("cursor")
        ? Response.json({ items: [{ id: "msg_3" }], nextCursor: null })
        : Response.json({ items: [{ id: "msg_1" }, { id: "msg_2" }], nextCursor: "next" });
    }
    const id = url.pathname.split("/").at(-1);
    return Response.json({
      id,
      threadId: "thread_0000000000000000",
      from: { address: "customer@example.com" },
      direction: "inbound",
      occurredAt: "2026-01-01T00:00:00.000Z",
      channel: "email",
      text: id,
    });
  });
  vi.stubGlobal("fetch", fetch);
  const { adapter, chat } = setup();
  await chat.initialize();
  const first = await adapter.fetchMessages(threadId, { limit: 1 });
  expect(first.messages.map(({ id }) => id)).toEqual(["msg_3"]);
  expect(first.nextCursor).toBe("msg_3");
  const second = await adapter.fetchMessages(threadId, { limit: 1, cursor: "msg_3" });
  expect(second.messages.map(({ id }) => id)).toEqual(["msg_2"]);
  expect(second.nextCursor).toBe("msg_2");
  expect(fetch).toHaveBeenCalledTimes(4);
});

it.each([
  { from: "notifications.NO-REPLY@example.com" },
  { from: "no_reply+notifications@example.com" },
  { from: "mailer-daemon@example.com" },
  { from: "postmaster@example.com" },
  { from: "bounce-12345@example.com" },
  { headerFields: { "aUtO-sUbMiTtEd": "auto-replied; comment=delivery" } },
  { headerFields: { Precedence: ["LIST"] } },
])(
  "acknowledges automated and legacy email without dispatching $from $headerFields",
  async (input) => {
    const { chat } = setup();
    const processMessage = vi.spyOn(chat, "processMessage");
    expect((await chat.webhooks.samva(await delivery({ channel: null, ...input }))).status).toBe(
      204,
    );
    expect(processMessage).not.toHaveBeenCalled();
  },
);

it("allows automated email when explicitly opted in", async () => {
  const { chat } = setup(true);
  const processMessage = vi.spyOn(chat, "processMessage").mockResolvedValue();
  const request = await delivery({ channel: "email", from: "noreply@example.com" });
  expect((await chat.webhooks.samva(request)).status).toBe(204);
  expect(processMessage).toHaveBeenCalledTimes(1);
});

it.each([
  {
    channel: "email",
    subject: "Cancel order 1042",
    text: "Thanks",
    expected: "Subject: Cancel order 1042\n\nThanks",
  },
  {
    channel: null,
    subject: "Re: Order 1042",
    text: "Thanks\n\n> Quoted text",
    replyText: "Thanks",
    expected: "Subject: Re: Order 1042\n\nThanks",
  },
  { channel: "email", subject: "Order 1042", text: null, expected: "Subject: Order 1042" },
  { channel: "email", subject: null, text: "Thanks", expected: "Thanks" },
  { channel: "whatsapp", subject: "Ignored for WhatsApp", text: "Thanks", expected: "Thanks" },
] as const)(
  "preserves the text supplied to Chat for $channel and $subject",
  async ({ expected, ...input }) => {
    const { chat } = setup();
    const processMessage = vi
      .spyOn(chat, "processMessage")
      .mockImplementation(async (_adapter, _id, message) => {
        expect(message).toMatchObject({
          text: expected,
          formatted: { children: [{ children: [{ value: expected }] }] },
        });
      });
    const request = await delivery({
      ...input,
      from: input.channel === "whatsapp" ? "+15555550100" : "bouncehouse@example.com",
      headerFields: {
        "Auto-Submitted": input.channel === "whatsapp" ? "auto-generated" : "no",
      },
    });
    expect((await chat.webhooks.samva(request)).status).toBe(204);
    expect(processMessage).toHaveBeenCalledTimes(1);
  },
);

it("resolves a function API key before every request", async () => {
  const keys: (string | null)[] = [];
  const fetch = vi.fn(async (request: Request) => {
    keys.push(request.headers.get("x-api-key"));
    return Response.json(held, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  let issued = 0;
  const adapter = createSamvaAdapter({
    apiKey: async () => `key-${++issued}`,
    mailboxId,
    webhookSecret: secret,
  });
  const id = await adapter.openDM("+15555550100");
  await adapter.postMessage(id, "Hello");
  await adapter.postMessage(id, "Hello again");
  expect(keys).toEqual(["key-1", "key-2"]);
});

it("resolves a function webhook secret for every delivery, so a rotated secret applies at once", async () => {
  const rotated = generateWebhookSecret();
  let current = secret;
  const webhookSecret = vi.fn(() => current);
  const adapter = createSamvaAdapter({ apiKey: "test", mailboxId, webhookSecret });
  const chat = new Chat({
    userName: "Samva",
    adapters: { samva: adapter },
    state: createMemoryState(),
  });
  vi.spyOn(chat, "processMessage").mockResolvedValue(undefined);

  expect((await chat.webhooks.samva(await delivery({ id: "evt_1" }))).status).toBe(204);
  current = rotated;
  expect((await chat.webhooks.samva(await delivery({ id: "evt_2" }))).status).toBe(401);
  expect((await chat.webhooks.samva(await delivery({ id: "evt_3", key: rotated }))).status).toBe(
    204,
  );
  expect(webhookSecret).toHaveBeenCalledTimes(3);
});

it("fails a delivery instead of answering 401 when the secret resolver returns nothing", async () => {
  const adapter = createSamvaAdapter({ apiKey: "test", mailboxId, webhookSecret: () => "" });
  await expect(adapter.handleWebhook(await delivery())).rejects.toThrow(/empty webhook secret/);
});

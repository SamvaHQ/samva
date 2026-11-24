import { createClient, ForbiddenError, MailboxSendConflictError, type SamvaClient } from "samva";
import { expect, it, vi } from "vitest";

import { samvaTools } from "../src/index";

const call = { toolCallId: "tool", messages: [], context: {} };
const message = { mailboxId: "mbx", messageId: "msg", channel: "whatsapp" } as const;
const receipt = {
  actionId: "act",
  draftId: null,
  messageId: null,
  threadId: null,
  state: "approvalRequired",
  acceptedAt: null,
  waitReason: null,
  reviewExpectedAt: null,
  skippedRecipients: [],
  executeUntil: null,
  retryAt: null,
  problem: null,
  retryEligible: false,
  decision: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as const;
// What the model reads back: the receipt without its decision record, timestamps, or retry flag.
const projected = {
  actionId: "act",
  state: "approvalRequired",
  messageId: null,
  threadId: null,
  waitReason: null,
  retryAt: null,
  reviewExpectedAt: null,
  executeUntil: null,
  skippedRecipients: [],
  problem: null,
  decision: null,
};

it("claims the event before awaiting a reply and reports a hold", async () => {
  const client = createClient({ apiKey: "test" });
  const held: Awaited<ReturnType<Mailboxes["reply"]>> = {
    ...receipt,
    skippedRecipients: [],
    decision: {
      id: "dec_1",
      reviewRound: 1,
      requirement: "person",
      decider: "person",
      outcome: "hold",
      reason: "rule:apiKey:0",
      scopes: [{ kind: "apiKey", id: "key_1" }],
      rule: { scope: { kind: "apiKey", id: "key_1" }, index: 0 },
    },
  };
  const reply = vi.spyOn(client.mailboxes, "reply").mockResolvedValue(held);
  const tools = samvaTools({ client, message, eventId: "evt" });
  const result = tools.reply_to_customer.execute({ text: "Hello" }, call);
  expect(tools.leave_for_person.execute({ reason: "Escalate" }, call)).toEqual({
    status: "already handled",
  });
  await expect(tools.reply_to_customer.execute({ text: "Again" }, call)).resolves.toEqual({
    status: "already handled",
  });
  await expect(result).resolves.toStrictEqual({
    status: "held for approval",
    receipt: {
      ...projected,
      decision: { outcome: "hold", decider: "person", reason: "rule:apiKey:0" },
    },
  });
  expect(reply).toHaveBeenCalledExactlyOnceWith(
    { id: "mbx", messageId: "msg", channel: "whatsapp", text: "Hello" },
    { idempotencyKey: "reply:evt" },
  );
});

it("returns the original receipt when redelivery drafts different text", async () => {
  const client = createClient({ apiKey: "test" });
  const held = { ...receipt, skippedRecipients: [] };
  vi.spyOn(client.mailboxes, "reply").mockRejectedValue(
    new MailboxSendConflictError({
      id: "act",
      resource: "mailbox",
      message: "conflict",
      receipt: held,
    }),
  );
  const tools = samvaTools({ client, message, eventId: "evt" });
  await expect(tools.reply_to_customer.execute({ text: "Different" }, call)).resolves.toEqual({
    status: "held for approval",
    receipt: projected,
  });
});

it("leaves the event for a person before a competing reply", async () => {
  const client = createClient({ apiKey: "test" });
  const reply = vi.spyOn(client.mailboxes, "reply");
  const tools = samvaTools({ client, message, eventId: "evt" });
  expect(tools.leave_for_person.execute({ reason: "Escalate" }, call)).toEqual({
    status: "left for a person",
    reason: "Escalate",
  });
  await expect(tools.reply_to_customer.execute({ text: "Too late" }, call)).resolves.toEqual({
    status: "already handled",
  });
  expect(reply).not.toHaveBeenCalled();
});

type Mailboxes = SamvaClient["mailboxes"];
type ThreadMessage = Awaited<ReturnType<Mailboxes["getThreadContent"]>>["items"][number];
type ThreadSummary = Awaited<ReturnType<Mailboxes["listThreads"]>>["items"][number];

const sentBy = { kind: "apiKey", id: "key_1" } as const;
const emailMessage: Extract<ThreadMessage, { channel: "email" }> = {
  id: "msg_email",
  campaign: { campaignId: "cmp_1", runId: "run_1" },
  threadId: "thread",
  conversationId: "conv_1",
  direction: "inbound",
  from: { actor: sentBy, displayName: "Ada", address: "ada@example.com" },
  sentBy,
  occurredAt: "2026-01-01T00:00:00Z",
  channel: "email",
  recipients: [
    { kind: "to", address: "support@acme.samva.email" },
    { kind: "cc", address: "ops@example.com" },
    { kind: "bcc", address: "audit@example.com" },
  ],
  replyTo: ["ada@example.com"],
  subject: "Where is my order?",
  text: "It has not arrived.\n\n> On Monday you wrote: it shipped.",
  html: "<p>It has not arrived.</p>",
  replyText: "It has not arrived.",
  headers: { messageId: "<m1@example.com>", inReplyTo: null, references: [] },
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
  attachments: [
    {
      id: "att_1",
      filename: "receipt.pdf",
      contentType: "application/pdf",
      size: 10,
      isInline: false,
    },
    { id: "att_2", filename: "logo.png", contentType: "image/png", size: 5, isInline: true },
  ],
};
const chatMessage: Extract<ThreadMessage, { channel: "whatsapp" | "sms" }> = {
  id: "msg_chat",
  threadId: "thread",
  conversationId: "conv_1",
  direction: "outbound",
  from: { address: "+15550000001" },
  sentBy,
  occurredAt: "2026-01-01T00:01:00Z",
  channel: "whatsapp",
  to: ["+15550000002"],
  text: null,
  media: [{ type: "image", contentType: "image/jpeg", filename: null, caption: null }],
  template: { name: "order_update", language: "en" },
  summary: null,
  contextMessageId: "msg_email",
};
const threadSummary: ThreadSummary = {
  id: "thread",
  channel: "email",
  endpointId: "ep_1",
  deliveredTo: "support+orders@acme.samva.email",
  subject: "Where is my order?",
  preview: "It has not arrived.",
  from: { address: "ada@example.com", displayName: "Ada" },
  messageCount: 2,
  hasAttachments: true,
  hasDraft: false,
  folder: "inbox",
  spam: { reason: null, source: "classifier" },
  priority: "normal",
  labels: ["lbl_1"],
  read: false,
  starred: false,
  snoozedUntil: null,
  doneAt: null,
  closedAt: null,
  closedBy: null,
  lastActivityAt: "2026-01-01T00:01:00Z",
};

it("scopes thread reads and search to the inbound mailbox", async () => {
  const client = createClient({ apiKey: "test" });
  const page = { items: [], nextCursor: "next" };
  const getThread = vi.spyOn(client.mailboxes, "getThreadContent").mockResolvedValue(page);
  const search = vi.spyOn(client.mailboxes, "listThreads").mockResolvedValue(page);
  const tools = samvaTools({ client, message, eventId: "evt" });

  await expect(tools.get_thread.execute({ threadId: "thread", limit: 10 }, call)).resolves.toEqual({
    threadId: "thread",
    items: [],
    nextCursor: "next",
  });
  await expect(
    tools.search_threads.execute({ query: "order", cursor: "next", limit: 10 }, call),
  ).resolves.toEqual({ items: [], nextCursor: "next" });
  expect(getThread).toHaveBeenCalledWith({
    id: "mbx",
    threadId: "thread",
    limit: 10,
    cursor: undefined,
  });
  expect(search).toHaveBeenCalledWith({ id: "mbx", q: "order", cursor: "next", limit: 10 });
});

it("gives the model each message's id, sender, and own words, not the raw thread", async () => {
  const client = createClient({ apiKey: "test" });
  vi.spyOn(client.mailboxes, "getThreadContent").mockResolvedValue({
    items: [emailMessage, chatMessage],
    nextCursor: null,
  });
  const tools = samvaTools({ client, message, eventId: "evt" });

  const result = await tools.get_thread.execute({ threadId: "thread", limit: 10 }, call);
  expect(result).toStrictEqual({
    threadId: "thread",
    items: [
      {
        id: "msg_email",
        channel: "email",
        direction: "inbound",
        occurredAt: "2026-01-01T00:00:00Z",
        from: { address: "ada@example.com", name: "Ada" },
        to: ["support@acme.samva.email"],
        cc: ["ops@example.com"],
        subject: "Where is my order?",
        text: "It has not arrived.",
        attachments: [{ name: "receipt.pdf", type: "application/pdf" }],
      },
      {
        id: "msg_chat",
        channel: "whatsapp",
        direction: "outbound",
        occurredAt: "2026-01-01T00:01:00Z",
        from: { address: "+15550000001", name: null },
        to: ["+15550000002"],
        text: null,
        template: "order_update",
        contextMessageId: "msg_email",
        attachments: [{ name: null, type: "image" }],
      },
    ],
    nextCursor: null,
  });
  const serialized = JSON.stringify(result);
  for (const dropped of [
    "campaign",
    "conversationId",
    "sentBy",
    "html",
    "headers",
    "authentication",
    "replyTo",
    "audit@example.com",
    "On Monday you wrote",
  ]) {
    expect(serialized).not.toContain(dropped);
  }
});

it("falls back to the full text and a chat summary when nothing shorter exists", async () => {
  const client = createClient({ apiKey: "test" });
  const { replyText: _, ...withoutReply } = emailMessage;
  vi.spyOn(client.mailboxes, "getThreadContent").mockResolvedValue({
    items: [
      withoutReply,
      { ...emailMessage, replyText: "" },
      { ...chatMessage, channel: "sms", template: null, summary: "Reacted 👍" },
    ],
    nextCursor: null,
  });
  const tools = samvaTools({ client, message, eventId: "evt" });

  const result = await tools.get_thread.execute({ threadId: "thread", limit: 10 }, call);
  expect(result).toMatchObject({
    items: [
      { text: emailMessage.text },
      { text: emailMessage.text },
      { channel: "sms", text: "Reacted 👍" },
    ],
  });
  expect(JSON.stringify(result)).not.toContain("template");
});

it("gives the model a short row per thread with a cursor to page", async () => {
  const client = createClient({ apiKey: "test" });
  const { spam: _, ...notSpam } = threadSummary;
  vi.spyOn(client.mailboxes, "listThreads").mockResolvedValue({
    items: [threadSummary, { ...notSpam, id: "thread_2", from: null }],
    nextCursor: "next",
  });
  const tools = samvaTools({ client, message, eventId: "evt" });

  await expect(tools.search_threads.execute({ limit: 10 }, call)).resolves.toStrictEqual({
    items: [
      {
        id: "thread",
        channel: "email",
        subject: "Where is my order?",
        preview: "It has not arrived.",
        from: { address: "ada@example.com", name: "Ada" },
        messageCount: 2,
        folder: "inbox",
        lastActivityAt: "2026-01-01T00:01:00Z",
        spam: { reason: null },
      },
      {
        id: "thread_2",
        channel: "email",
        subject: "Where is my order?",
        preview: "It has not arrived.",
        from: null,
        messageCount: 2,
        folder: "inbox",
        lastActivityAt: "2026-01-01T00:01:00Z",
      },
    ],
    nextCursor: "next",
  });
});

it("tells the model why a reply waits and drops the decision record", async () => {
  const client = createClient({ apiKey: "test" });
  vi.spyOn(client.mailboxes, "reply").mockResolvedValue({
    ...receipt,
    state: "queued",
    waitReason: "onboarding-review",
    reviewExpectedAt: "2026-01-02T00:00:00Z",
    skippedRecipients: [{ address: "gone@example.com", reason: "bounce", topicId: null }],
    problem: {
      code: "reviewPending",
      message: "Your organization is in review.",
      error: null,
    },
  });
  const tools = samvaTools({ client, message, eventId: "evt" });

  await expect(tools.reply_to_customer.execute({ text: "Hello" }, call)).resolves.toStrictEqual({
    status: "queued",
    receipt: {
      ...projected,
      state: "queued",
      waitReason: "onboarding-review",
      reviewExpectedAt: "2026-01-02T00:00:00Z",
      skippedRecipients: [{ address: "gone@example.com", reason: "bounce" }],
      problem: {
        code: "reviewPending",
        message: "Your organization is in review.",
      },
    },
  });
});

it("reopens the claim after a definite Samva refusal", async () => {
  const client = createClient({ apiKey: "test" });
  vi.spyOn(client.mailboxes, "reply").mockRejectedValue(
    new ForbiddenError({ message: "Refused" }, { response: new Response(null, { status: 403 }) }),
  );
  const tools = samvaTools({ client, message, eventId: "evt" });
  await expect(tools.reply_to_customer.execute({ text: "Hello" }, call)).rejects.toThrow("Refused");
  expect(tools.leave_for_person.execute({ reason: "Escalate" }, call)).toEqual({
    status: "left for a person",
    reason: "Escalate",
  });
});

it("allows a same-key reply retry after an unknown outcome", async () => {
  const client = createClient({ apiKey: "test" });
  const held = { ...receipt, skippedRecipients: [] };
  const reply = vi
    .spyOn(client.mailboxes, "reply")
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce(held);
  const tools = samvaTools({ client, message, eventId: "evt" });

  await expect(tools.reply_to_customer.execute({ text: "Hello" }, call)).rejects.toThrow(
    "Lost response",
  );
  expect(tools.leave_for_person.execute({ reason: "Escalate" }, call)).toEqual({
    status: "reply outcome unknown",
  });
  await expect(tools.reply_to_customer.execute({ text: "Hello again" }, call)).resolves.toEqual({
    status: "held for approval",
    receipt: projected,
  });
  expect(reply.mock.calls.map(([, options]) => options?.idempotencyKey)).toEqual([
    "reply:evt",
    "reply:evt",
  ]);
});

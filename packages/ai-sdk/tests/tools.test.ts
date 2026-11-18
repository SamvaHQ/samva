import { createClient, ForbiddenError, MailboxSendConflictError } from "samva";
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

it("claims the event before awaiting a reply and reports a hold", async () => {
  const client = createClient({ apiKey: "test" });
  const held = { ...receipt, skippedRecipients: [] };
  const reply = vi.spyOn(client.mailboxes, "reply").mockResolvedValue(held);
  const tools = samvaTools({ client, message, eventId: "evt" });
  const result = tools.reply_to_customer.execute({ text: "Hello" }, call);
  expect(tools.leave_for_person.execute({ reason: "Escalate" }, call)).toEqual({
    status: "already handled",
  });
  await expect(tools.reply_to_customer.execute({ text: "Again" }, call)).resolves.toEqual({
    status: "already handled",
  });
  await expect(result).resolves.toEqual({ status: "held for approval", receipt: held });
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
    receipt: held,
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

it("scopes thread reads and search to the inbound mailbox", async () => {
  const client = createClient({ apiKey: "test" });
  const page = { items: [], nextCursor: null };
  const getThread = vi.spyOn(client.mailboxes, "getThreadContent").mockResolvedValue(page);
  const search = vi.spyOn(client.mailboxes, "listThreads").mockResolvedValue(page);
  const tools = samvaTools({ client, message, eventId: "evt" });

  await expect(tools.get_thread.execute({ threadId: "thread", limit: 10 }, call)).resolves.toEqual(
    page,
  );
  await expect(
    tools.search_threads.execute({ query: "order", cursor: "next", limit: 10 }, call),
  ).resolves.toEqual(page);
  expect(getThread).toHaveBeenCalledWith({
    id: "mbx",
    threadId: "thread",
    limit: 10,
    cursor: undefined,
  });
  expect(search).toHaveBeenCalledWith({ id: "mbx", q: "order", cursor: "next", limit: 10 });
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
    receipt: held,
  });
  expect(reply.mock.calls.map(([, options]) => options?.idempotencyKey)).toEqual([
    "reply:evt",
    "reply:evt",
  ]);
});

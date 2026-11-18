import { createClient, MailboxSendConflictError } from "samva";
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

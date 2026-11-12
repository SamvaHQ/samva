import { tool } from "@anthropic-ai/claude-agent-sdk";
import { MailboxSendConflictError, WhatsAppServiceWindowClosedError } from "samva";
import type { SamvaClient } from "samva";
import { z } from "zod";

import type { ReceivedMessage } from "./message";

/** What the agent did with one message. `undefined` means it finished without choosing. */
export type Outcome =
  | { readonly kind: "replied"; readonly state: string; readonly actionId: string }
  | { readonly kind: "already-answered"; readonly state: string; readonly actionId: string }
  | { readonly kind: "window-closed" }
  | { readonly kind: "left"; readonly reason: string };

/** The two tools for one message, and a way to read what the agent chose. */
export interface MailboxTools {
  readonly replyToMessage: ReturnType<typeof replyTool>;
  readonly leaveForPerson: ReturnType<typeof leaveTool>;
  readonly outcome: () => Outcome | undefined;
  /** A Samva failure the agent could not act on. The caller rethrows it after the turn. */
  readonly failure: () => unknown;
}

const text = (value: string, isError = false) => ({
  content: [{ type: "text" as const, text: value }],
  isError,
});

const replyTool = (run: (replyText: string) => Promise<ReturnType<typeof text>>) =>
  tool(
    "reply_to_message",
    "Send your reply to the customer's message. A person at the business approves it before it is sent. Call this once.",
    { text: z.string().min(1).describe("The reply, in plain text.") },
    async (args) => run(args.text),
    { annotations: { destructiveHint: true, openWorldHint: true }, alwaysLoad: true },
  );

const leaveTool = (run: (reason: string) => ReturnType<typeof text>) =>
  tool(
    "leave_for_person",
    "Send nothing and leave this message for a person to handle. Use it when the business instructions do not cover the question or the message is not a customer asking for help.",
    { reason: z.string().min(1).describe("One short sentence for the person.") },
    async (args) => run(args.reason),
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

/**
 * Build the tools for one message. They close over the event, so the model supplies only the
 * reply text: it cannot choose the recipient, channel, or thread. Each reply is keyed by the
 * event id, so a replayed event cannot send twice.
 */
export const createMailboxTools = (
  samva: SamvaClient,
  message: ReceivedMessage,
  eventId: string,
): MailboxTools => {
  let outcome: Outcome | undefined;
  let failure: unknown;
  // Set before any await: the SDK can run two tool calls at once, and one message gets one action.
  let claimed = false;

  const send = async (replyText: string) => {
    if (claimed) return text("You already acted on this message. Stop.", true);
    claimed = true;
    // One call answers both channels. The mailbox's decision rules decide whether the reply waits
    // for a person; this example expects a rule that holds every send (see the README).
    const reply =
      message.channel === "whatsapp"
        ? {
            id: message.mailboxId,
            messageId: message.messageId,
            channel: "whatsapp" as const,
            text: replyText,
          }
        : { id: message.mailboxId, messageId: message.messageId, text: replyText };
    try {
      // The event id is stable across redelivery, so a retry returns the original receipt.
      const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
      outcome = { kind: "replied", state: receipt.state, actionId: receipt.actionId };
      return text(`Submitted. State: ${receipt.state}. Do not send anything else.`);
    } catch (error) {
      // A replayed event drafts again, and the model rarely writes the same text twice. Samva
      // refuses a different body under a key it has seen with `MailboxSendConflictError`, which
      // carries the first reply's receipt: there is nothing left to do for this event. Any other
      // conflict, such as a paused mailbox, recorded no reply and is a failure below.
      if (error instanceof MailboxSendConflictError) {
        outcome = {
          kind: "already-answered",
          state: error.receipt.state,
          actionId: error.receipt.actionId,
        };
        return text("This message was already answered. Stop.");
      }
      // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
      // replayed old event can find it closed; only an approved template reaches them then.
      if (error instanceof WhatsAppServiceWindowClosedError) {
        outcome = { kind: "window-closed" };
        return text("The WhatsApp service window is closed, so nothing can be sent. Stop.");
      }
      failure = error;
      return text("Samva refused the reply. Stop.", true);
    }
  };

  const leave = (reason: string) => {
    if (claimed) return text("You already acted on this message. Stop.", true);
    claimed = true;
    outcome = { kind: "left", reason };
    return text("Left for a person. Stop.");
  };

  return {
    replyToMessage: replyTool(send),
    leaveForPerson: leaveTool(leave),
    outcome: () => outcome,
    failure: () => failure,
  };
};

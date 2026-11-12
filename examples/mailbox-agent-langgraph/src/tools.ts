import { tool } from "@langchain/core/tools";
import { MailboxSendConflictError, WhatsAppServiceWindowClosedError } from "samva";
import type { SamvaClient } from "samva";
import { z } from "zod";

import type { ReceivedMessage } from "./message";

/** What the agent did with a message. `failed` carries the error to throw once the run ends. */
export type Outcome =
  | { readonly kind: "none" }
  | { readonly kind: "replied" }
  | { readonly kind: "left" }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * The two actions the agent can take on one message. Both close over the event, so the model
 * supplies only the reply text or a reason: it cannot choose the recipient, channel, or thread.
 * `outcome()` reports which one ran.
 */
export const messageTools = (
  samva: SamvaClient,
  received: ReceivedMessage,
  eventId: string,
  log: (line: string) => void,
) => {
  let outcome: Outcome = { kind: "none" };
  // Set before any await: a model can call both tools in one turn, and the calls run together.
  let claimed = false;

  const reply_to_customer = tool(
    async ({ text }) => {
      if (claimed) return "You already finished this message. Do not call again.";
      claimed = true;

      // One call answers both channels. The mailbox's decision rules decide whether the reply
      // waits for a person; this example expects a rule that holds every send (see the README).
      const reply =
        received.channel === "whatsapp"
          ? {
              id: received.mailboxId,
              messageId: received.messageId,
              channel: "whatsapp" as const,
              text,
            }
          : { id: received.mailboxId, messageId: received.messageId, text };

      try {
        // The event id is stable across redelivery, so a retry returns the original receipt.
        const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
        outcome = { kind: "replied" };
        log(`reply to ${received.messageId}: ${receipt.state}, action ${receipt.actionId}`);
        return `Submitted. The reply is ${receipt.state}.`;
      } catch (error) {
        // A replayed event drafts again, and the model rarely writes the same text twice. Samva
        // refuses a different body under a key it has seen with `MailboxSendConflictError`, which
        // carries the first reply's receipt: there is nothing left to do for this event. Any other
        // conflict, such as a paused mailbox, recorded no reply and is a failure below.
        if (error instanceof MailboxSendConflictError) {
          outcome = { kind: "replied" };
          log(
            `already answered ${received.messageId}: ${error.receipt.state}, action ${error.receipt.actionId}`,
          );
          return "This message was already answered. Do not call again.";
        }
        // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
        // replayed old event can find it closed; only an approved template reaches them then.
        if (error instanceof WhatsAppServiceWindowClosedError) {
          outcome = { kind: "left" };
          log(`skipped ${received.messageId}: WhatsApp service window closed`);
          return "The WhatsApp window is closed, so nothing was sent. Do not call again.";
        }
        outcome = { kind: "failed", error };
        return "Sending failed. Do not call again.";
      }
    },
    {
      name: "reply_to_customer",
      description:
        "Reply to the customer's message with plain text. The reply is held for a person's approval.",
      schema: z.object({ text: z.string().trim().min(1).describe("The reply text to send.") }),
      // Both tools finish the message: end the run instead of calling the model again.
      returnDirect: true,
    },
  );

  const leave_for_person = tool(
    async ({ reason }) => {
      if (claimed) return "You already finished this message. Do not call again.";
      claimed = true;
      outcome = { kind: "left" };
      log(`left ${received.messageId} for a person: ${reason}`);
      return "Left for a person. Nothing was sent.";
    },
    {
      name: "leave_for_person",
      description:
        "Send nothing and leave the message for a person. Use when the instructions do not cover it.",
      schema: z.object({ reason: z.string().describe("One short sentence on why.") }),
      returnDirect: true,
    },
  );

  return { tools: [reply_to_customer, leave_for_person], outcome: () => outcome };
};

import { tool } from "@openai/agents";
import { ConflictError, WhatsAppServiceWindowClosedError } from "samva";
import type { SamvaClient } from "samva";
import { z } from "zod";

import type { ReceivedMessage } from "./message";

/**
 * The two actions the agent can take on one incoming message. Both close over the message, so the
 * model supplies only the words: it cannot choose the recipient, channel, or thread.
 */
export const mailboxTools = (
  samva: SamvaClient,
  received: ReceivedMessage,
  eventId: string,
  log: (line: string) => void,
) => {
  // Set before any await: a model can call both tools in one turn, and the calls run together.
  let claimed = false;

  const replyToCustomer = tool({
    name: "reply_to_customer",
    description:
      "Submit a reply to the customer's message. A person at the business approves it before it is sent.",
    parameters: z.object({ text: z.string().min(1).describe("The plain-text reply.") }),
    // A failed request stops the turn instead of going back to the model as text.
    errorFunction: null,
    execute: async ({ text }) => {
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
        log(`reply to ${received.messageId}: ${receipt.state}, action ${receipt.actionId}`);
        return `Submitted: ${receipt.state}.`;
      } catch (error) {
        // A replayed event runs the agent again, and the model rarely writes the same text twice.
        // Samva refuses a different body under a key it has seen, which means the first reply was
        // already submitted: there is nothing left to do for this event.
        if (error instanceof ConflictError) {
          log(`already answered ${received.messageId}`);
          return "Already answered.";
        }
        // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
        // replayed old event can find it closed; only an approved template reaches them then.
        if (error instanceof WhatsAppServiceWindowClosedError) {
          log(`skipped ${received.messageId}: WhatsApp service window closed`);
          return "Not sent: the WhatsApp service window is closed.";
        }
        throw error;
      }
    },
  });

  const leaveForPerson = tool({
    name: "leave_for_person",
    description:
      "Send nothing and leave this message for a person. Use it when the business instructions do not cover the question or the message is not a customer asking for help.",
    parameters: z.object({
      reason: z.string().min(1).describe("One short sentence for the person."),
    }),
    execute: async ({ reason }) => {
      if (claimed) return "You already finished this message. Do not call again.";
      claimed = true;
      log(`left ${received.messageId} for a person: ${reason}`);
      return "Left for a person.";
    },
  });

  return [replyToCustomer, leaveForPerson];
};

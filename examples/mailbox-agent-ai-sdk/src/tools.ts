import { tool } from "ai";
import type { SamvaClient } from "samva";
import { z } from "zod";

import type { ReceivedMessage } from "./message";

/** What one agent turn did, recorded by the tools so the caller can act on it. */
export interface TurnOutcome {
  reply?: { readonly state: string; readonly actionId: string };
  /** The error `mailboxes.reply` threw. The tool hides it from the model; the caller decides. */
  error?: unknown;
  leftForPerson?: string;
}

/**
 * The two actions the agent can take on one message. Both close over the event, so the model
 * supplies only the text or the reason: it cannot choose the recipient, channel, or thread.
 */
export const mailboxTools = (
  samva: SamvaClient,
  message: ReceivedMessage,
  eventId: string,
  outcome: TurnOutcome,
) => ({
  reply_to_customer: tool({
    description:
      "Submit a reply to the customer's message. It is held for a person's approval before it is sent.",
    inputSchema: z.object({ text: z.string().trim().min(1).describe("The plain-text reply.") }),
    execute: async ({ text }) => {
      // One call answers both channels. The mailbox's decision rules decide whether the reply
      // waits for a person; this example expects a rule that holds every send (see the README).
      const reply =
        message.channel === "whatsapp"
          ? {
              id: message.mailboxId,
              messageId: message.messageId,
              channel: "whatsapp" as const,
              text,
            }
          : { id: message.mailboxId, messageId: message.messageId, text };
      try {
        // The event id is stable across redelivery, so a retry returns the original receipt.
        const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
        outcome.reply = { state: receipt.state, actionId: receipt.actionId };
        return `Reply submitted (${receipt.state}).`;
      } catch (error) {
        outcome.error = error;
        return "The reply could not be submitted. Do not try again.";
      }
    },
  }),

  leave_for_person: tool({
    description: "Leave this message for a person to answer. Nothing is sent.",
    inputSchema: z.object({ reason: z.string().trim().min(1).describe("One short sentence.") }),
    execute: async ({ reason }) => {
      outcome.leftForPerson = reason;
      return "Left for a person.";
    },
  }),
});

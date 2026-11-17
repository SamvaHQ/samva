import { WhatsAppServiceWindowClosedError } from "samva";
import { defineAgent } from "samva/agent";

import { composeReply, parseReceivedMessage } from "./reply";

/**
 * The agent as a hosted agent module. Samva runs the `mailbox.message.received` handler for each
 * event on the mailbox behind `endpointIds`; `ctx.samva` can read that mailbox and reply to the
 * received message, nothing else. The agent's `policy` holds each reply for a person.
 */
export default defineAgent({
  manifest: {
    name: "Reply agent",
    version: "1.0.0",
    // Replace with the mailbox endpoint id the module serves.
    endpointIds: ["mbe_..."],
    integrations: [],
    eventTriggers: [],
    policy: { presets: [], rules: [{ match: { effect: "write" }, atLeast: "person" }] },
    model: "standard",
    reasoning: "auto",
    workingHours: null,
    takeoverTimeoutMinutes: 30,
  },
  instructions: "Acknowledge incoming mail through the registered event handler.",
  events: {
    "mailbox.message.received": async (event, ctx) => {
      const received = parseReceivedMessage(event.data);
      if (received === undefined) throw new Error(`Malformed event ${event.id}`);

      const text = composeReply(received);
      if (text === undefined) {
        ctx.log("skipped", received.messageId);
        return;
      }

      try {
        // The SDK derives the idempotency key from the agent, event, and call order, so a retry
        // cannot double-send.
        const receipt = await ctx.samva.mailboxes.reply(
          received.channel === "whatsapp"
            ? { id: received.mailboxId, messageId: received.messageId, channel: "whatsapp", text }
            : { id: received.mailboxId, messageId: received.messageId, text },
        );
        ctx.log(receipt.state, receipt.actionId);
      } catch (error) {
        // Throwing here retries the event, and a retry cannot reopen a closed service window.
        if (!(error instanceof WhatsAppServiceWindowClosedError)) throw error;
        ctx.log("skipped", received.messageId, "service window closed");
      }
    },
  },
});

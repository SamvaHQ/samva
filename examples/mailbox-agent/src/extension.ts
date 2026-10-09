import { defineExtension } from "@samva/mailbox";

import { composeReply, parseReceivedMessage } from "./reply";

/**
 * The agent as a webhook extension. It asks for the least it needs: `read` is required and
 * `send` lets it reply. Install it with `--send-mode approval` so a reply waits for a person.
 */
export default defineExtension({
  manifest: {
    name: "reply-agent",
    displayName: "Reply agent",
    version: "1.0.0",
    runtime: "webhook",
    events: ["mailbox.message.received"],
    permissions: ["read", "send"],
  },
  on: {
    "mailbox.message.received": async (event, { samva, log }) => {
      const received = parseReceivedMessage(event.data);
      if (received === undefined) throw new Error(`Malformed event ${event.id}`);

      const text = composeReply(received);
      if (text === undefined) {
        log("skipped", received.messageId);
        return;
      }

      // The client derives the Idempotency-Key from the event id, so a retry cannot double-send.
      const receipt = await samva.messages.reply(received.mailboxId, received.messageId, { text });
      log(receipt.status, receipt.actionId);
    },
  },
});

# @samva/eve

Mount Samva's mailbox tools and customer-message instructions in an Eve agent. The extension can also mount a Chat SDK channel for signed email and WhatsApp webhooks.

```sh
npm install @samva/eve eve ai chat samva @chat-adapter/state-memory
```

Set `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, and `SAMVA_WEBHOOK_SECRET`. Point its `mailbox.message.received` webhook at `/eve/v1/samva` on the agent deployment.

Before running the agent, create a mailbox-scoped API key with the approval rule `{ match: { effect: "write" }, atLeast: "person" }`. In a test conversation, verify the reply returns `approvalRequired` and review it in the dashboard. See the [mailbox approval setup](https://github.com/SamvaHQ/samva/blob/main/cookbooks/mailboxes.md).

```ts
// agent/extensions/samva.ts
import { createMemoryState } from "@chat-adapter/state-memory";
import samva from "@samva/eve";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

export default samva({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhook: {
    secret: required("SAMVA_WEBHOOK_SECRET"),
    state: createMemoryState(),
  },
});
```

Use a shared Chat SDK state adapter in a deployment with multiple instances. The channel starts Eve turns on signed deliveries and queues new inputs for a thread while a turn is active. The reply tool submits through Samva approval rules. Eve's channel output remains in the session so it cannot also send a customer reply.

To use an existing Eve channel, omit `webhook` and expose `eventId`, `mailboxId`, `messageId`, and `channel` (`email` or `whatsapp`) via the channel's server-owned metadata after verifying the event. The four tools appear on turns with a matching inbound message. Never populate these fields from model input or customer-supplied text.

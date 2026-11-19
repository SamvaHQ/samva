# @samva/chat-adapter

Receive email and WhatsApp messages in Chat SDK through signed Samva mailbox webhooks. Replies are submitted through the mailbox's sending and approval rules.

```sh
npm install @samva/chat-adapter chat samva @chat-adapter/state-memory
```

Set `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, and `SAMVA_WEBHOOK_SECRET`. Configure a mailbox webhook for `mailbox.message.received` and point it at the route that exports this `POST` handler.

Before running the agent, create a mailbox-scoped API key with the approval rule `{ match: { effect: "write" }, atLeast: "person" }`. In a test conversation, verify the reply returns `approvalRequired` and review it in the dashboard. See the [mailbox approval setup](https://github.com/SamvaHQ/samva/blob/main/cookbooks/mailboxes.md).

```ts
import { createMemoryState } from "@chat-adapter/state-memory";
import { createSamvaAdapter, receiptOf } from "@samva/chat-adapter";
import { Chat, type Message, type Thread } from "chat";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const samva = createSamvaAdapter({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhookSecret: required("SAMVA_WEBHOOK_SECRET"),
});

const chat = new Chat({
  userName: "Support",
  adapters: { samva },
  state: createMemoryState(),
  concurrency: "concurrent",
});

async function acknowledge(thread: Thread, message: Message) {
  if (message.author.isMe) return;
  const posted = await samva.postMessage(thread.id, "Thanks for your message.");
  const receipt = receiptOf(posted);
  if (receipt?.state === "approvalRequired") {
    console.info("Reply held for approval", receipt.actionId);
  }
}

chat.onNewMention(acknowledge);
chat.onSubscribedMessage(acknowledge);
chat.onDirectMessage(acknowledge);

export const POST = (request: Request) => chat.webhooks.samva(request);
```

`apiKey` and `webhookSecret` also accept a function that returns the value, synchronously or as a promise. The adapter calls `apiKey` before every API request and `webhookSecret` for every delivery, and caches neither, so a rotated or short-lived credential applies immediately. If a resolver throws or returns an empty value, the webhook handler throws instead of answering `401`, so the delivery is retried.

```ts
const samva = createSamvaAdapter({
  apiKey: () => secrets.get("samva-api-key"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhookSecret: () => secrets.get("samva-webhook-secret"),
});
```

Use a shared Chat SDK state adapter when deploying across workers so webhook deduplication works across instances. Pass the original request to the webhook handler. Authentication uses the signed body bytes.

Email uses thread scope and WhatsApp arrives as a direct message. Replies posted from the webhook handler address its inbound message, even if another message arrives during the turn. Posts outside that handler resolve the thread's most recent inbound message. Use the example's Chat SDK concurrency mode to keep each handler in its own webhook context. Within a webhook handler, each post gets a key based on the delivery ID and its position in the handler. Keep posts in the same order when retrying a delivery. If a retry drafts different text for an existing post, the adapter returns that post’s saved receipt. Outside a webhook, matching text to the same inbound message reuses its action. `openDM(address)` starts a new conversation when you post to the returned ID. Use an email address or an E.164 phone number.

The adapter skips automated email by sender address and by `Auto-Submitted` or `Precedence` headers when included in the signed webhook. Set `includeAutomatedEmail: true` to receive those messages. Parsed email text includes the subject followed by the body.

A held send returns its Samva action ID and receipt. Streams buffer before submitting. Cards use fallback text. Edits, deletion, and reactions are unsupported. WhatsApp free text requires an open service window.

# @samva/chat-adapter

Receive email and WhatsApp messages in Chat SDK through signed Samva mailbox webhooks. Replies are submitted through the mailbox's sending and approval rules.

```sh
npm install @samva/chat-adapter chat samva @chat-adapter/state-memory
```

Create a mailbox-scoped API key. Set `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, and `SAMVA_WEBHOOK_SECRET`. Configure a mailbox webhook for `mailbox.message.received` and point it at the route that exports this `POST` handler.

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

Use a shared Chat SDK state adapter when deploying across workers so webhook deduplication works across instances. Pass the original request to the webhook handler. Authentication uses the signed body bytes.

Email uses thread scope and WhatsApp arrives as a direct message. Replies posted from the webhook handler address its inbound message, even if another message arrives during the turn. Posts outside that handler resolve the thread's most recent inbound message. Use the example's Chat SDK concurrency mode to keep each handler in its own webhook context. Replies use a deterministic key based on that message ID. `openDM(address)` starts a new conversation when you post to the returned ID. Use an email address or an E.164 phone number.

A held send returns its Samva action ID and receipt. Streams buffer before submitting. Cards use fallback text. Edits, deletion, and reactions are unsupported. WhatsApp free text requires an open service window.

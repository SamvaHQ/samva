# @samva/chat-adapter

<img src="https://samva.dev/icon-192.png" alt="Samva" width="48" height="48">

[![npm](https://img.shields.io/npm/v/@samva/chat-adapter)](https://www.npmjs.com/package/@samva/chat-adapter) [![license](https://img.shields.io/npm/l/@samva/chat-adapter)](./LICENSE)

Receive email and WhatsApp messages in Chat SDK through signed Samva mailbox webhooks. Replies are submitted through the mailbox's sending and approval rules.

## Installation

```sh
npm install @samva/chat-adapter chat samva @chat-adapter/state-memory
```

## Usage

Point the mailbox's `mailbox.message.received` webhook at the route that exports this `POST` handler.

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

`chat.webhooks.samva(request)` takes a Web `Request` and returns a `Response`, so it runs in any framework, and the route path is yours: it only has to match the webhook URL. With Bun:

```ts
Bun.serve({
  port: 3000,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/samva") return chat.webhooks.samva(request);
    return new Response("Not found", { status: 404 });
  },
});
```

The adapter receives by webhook only, so it needs a public URL. A server without one reads `samva.mailboxes.events` instead, as in the [mailboxes cookbook](https://github.com/SamvaHQ/samva/blob/main/cookbooks/mailboxes.md#follow-events).

Pass the original request to the webhook handler. Authentication uses the signed body bytes. Use a shared Chat SDK state adapter when deploying across workers so webhook deduplication works across instances.

## Environment variables

| Variable               | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `SAMVA_API_KEY`        | Mailbox-scoped Samva API key. Replies and thread reads use it. |
| `SAMVA_MAILBOX_ID`     | ID of the mailbox the adapter receives and replies for.        |
| `SAMVA_WEBHOOK_SECRET` | Signing secret of the mailbox webhook.                         |

The adapter reads none of these itself. Pass them to `createSamvaAdapter`, as in the example.

## Configuration

| Option                  | Type                                          | Description                                                                      |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `apiKey`                | `string \| (() => string \| Promise<string>)` | Mailbox-scoped API key. Required. A function is called before every API request. |
| `mailboxId`             | `string`                                      | Mailbox ID. Required.                                                            |
| `webhookSecret`         | `string \| (() => string \| Promise<string>)` | Webhook signing secret. Required. A function is called for every delivery.       |
| `userName`              | `string`                                      | Bot user name. Defaults to `Samva`.                                              |
| `includeAutomatedEmail` | `boolean`                                     | Pass automated email to your handlers. Defaults to `false`.                      |

The adapter caches neither function result, so a rotated or short-lived credential applies immediately. If a resolver throws or returns an empty value, the webhook handler throws instead of answering `401`, so the delivery is retried.

```ts
const samva = createSamvaAdapter({
  apiKey: () => secrets.get("samva-api-key"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhookSecret: () => secrets.get("samva-webhook-secret"),
});
```

## Platform setup

1. Create a mailbox-scoped API key for the agent and give it the approval rule `{ match: { effect: "write" }, atLeast: "person" }`. A person sets the rule while signed in, or an organization-wide API key sets it on the agent's key (`policies.setPolicy`, `PUT /v1/policies/apiKey/{id}`). The agent's own key cannot set or lift its rule, and it can never approve or deny a send.
2. Deploy the route. The signing secret does not exist yet, so pass `webhookSecret` as a function that reads it per delivery. Until it is set, the handler throws and Samva retries the delivery.
3. Create a mailbox webhook for `mailbox.message.received` pointing at your route. The create response holds the signing `secret`; `GET /v1/webhooks/{id}/secret` and the MCP tool `webhooks_get_secret` return it later. Store it where the function reads it.
4. In a test conversation, verify the reply returns `approvalRequired` and review it in the dashboard.

See the [mailbox approval setup](https://github.com/SamvaHQ/samva/blob/main/cookbooks/mailboxes.md). A reply that stays `queued` has a `waitReason` or `problem.code` on its receipt, for example `onboarding-review` while a new organization's email onboarding review is pending. See [A send that stays queued](https://samva.dev/docs/mailboxes/approvals#a-send-that-stays-queued). Installing Samva from Vercel writes `SAMVA_API_KEY` and `SAMVA_MAILBOX_ID` to your projects. It writes `SAMVA_WEBHOOK_SECRET` only when you set **Receive messages at** to your route's URL; otherwise create the webhook yourself and set its secret ([docs](https://samva.dev/docs/integrations/vercel)).

## Smoke test the route

`samva webhooks test` and `POST /v1/webhooks/{id}/test` send only `webhook.test`, which this adapter answers with an empty `204`. They cannot produce `mailbox.message.received`. To exercise the route, sign a sample `mailbox.message.received` body with `signWebhook` from `@samva/webhooks` and send it with the three signing headers. The mailbox ID must match `SAMVA_MAILBOX_ID`; the other IDs are placeholders.

```ts
import { signWebhook } from "@samva/webhooks";

const now = new Date();
const body = JSON.stringify({
  type: "mailbox.message.received",
  timestamp: now.toISOString(),
  data: {
    mailboxId: process.env.SAMVA_MAILBOX_ID,
    namespaceId: null,
    thread: { id: "thread_0000000000000000", subject: null, preview: null },
    message: {
      id: "msg_0000000000000000",
      channel: "email",
      threadId: "thread_0000000000000000",
      from: { address: "customer@example.com" },
      to: [],
      cc: [],
      subject: null,
      text: "Hello",
      replyText: null,
      attachments: [],
      occurredAt: now.toISOString(),
    },
  },
});
const id = "msg_smoke_1";
const timestamp = Math.floor(now.getTime() / 1000);
const signature = await signWebhook({
  body,
  id,
  timestamp,
  secret: process.env.SAMVA_WEBHOOK_SECRET!,
});

const response = await fetch("http://localhost:3000/samva", {
  method: "POST",
  body,
  headers: {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": signature,
  },
});
console.log(response.status);
```

A `401` means the secret does not match. The route answers `204` both for a delivery it routed and for one it ignored, so confirm the turn ran in your Chat SDK handler, for example with a log line. A reply to the placeholder message ID cannot succeed, so a handler that replies fails at that step.

## Features

- Email threads and WhatsApp direct messages on one adapter. `openDM(address)` takes an email address or an E.164 phone number and starts a new conversation when you post to the returned ID.
- Signed webhook verification and deduplication through Chat SDK state.
- Replies follow the mailbox's decision rules. A held send returns its Samva action ID and receipt, read with `receiptOf`.
- Idempotent replies. Within a webhook handler, each post gets a key based on the delivery ID and its position in the handler, so keep posts in the same order when retrying a delivery. If a retry drafts different text for an existing post, the adapter returns that post's saved receipt. Outside a webhook, matching text to the same inbound message reuses its action. A post to an `openDM` conversation from inside a webhook handler is keyed the same way, by delivery and position. Outside a webhook, each such post is a new send, so check its receipt before you retry one.
- Replies posted from the webhook handler address its inbound message, even if another message arrives during the turn. Posts outside that handler resolve the thread's most recent inbound message. Use the `concurrent` mode shown above to keep each handler in its own webhook context.
- Thread and message history through `fetchThread` and `fetchMessages`. Parsed email text includes the subject followed by the body.
- Automated email is skipped by sender address and by `Auto-Submitted` or `Precedence` headers when the signed webhook includes them. Set `includeAutomatedEmail: true` to receive it.

Limitations: streams buffer before submitting, cards use fallback text, and edits, deletion, and reactions are unsupported. WhatsApp free text requires an open service window.

## License

MIT

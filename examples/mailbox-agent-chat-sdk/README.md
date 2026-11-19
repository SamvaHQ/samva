# Mailbox agent with Chat SDK + Samva

A [Chat SDK](https://chat-sdk.dev) bot that answers customers from a Samva mailbox, on email and
WhatsApp, in one Next.js route you deploy to Vercel.
[`@samva/chat-adapter`](../../packages/chat-adapter) verifies each signed mailbox webhook and
hands the message to your Chat SDK handlers. A reply goes through the mailbox's sending and
approval rules, so it returns a held receipt until a person approves it.

The bot lives in `lib/bot.ts` and answers every message with a fixed acknowledgement. Replace
`acknowledge` with your own logic. `app/api/samva/route.ts` exports `POST` from the bot.

For the adapter's behavior in depth, read the
[package README](../../packages/chat-adapter/README.md) and the
[Chat SDK guide](https://samva.dev/docs/mailboxes/chat-sdk).

## Setup

1. Create a mailbox-scoped API key with the approval rule
   `{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
   `state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
   with `samva login` in the CLI. An API key can never approve a send. See the
   [mailboxes cookbook](../../cookbooks/mailboxes.md).
2. Create a webhook on the mailbox for `mailbox.message.received` that points at
   `<your URL>/api/samva`, and copy its signing secret.
3. Copy `.env.example` to `.env.local` and fill it in.

## Environment

| Variable               | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `SAMVA_API_KEY`        | A mailbox-scoped Samva API key.                                    |
| `SAMVA_MAILBOX_ID`     | The mailbox the bot answers.                                       |
| `SAMVA_WEBHOOK_SECRET` | The signing secret of the webhook that delivers received messages. |

The bot reads them when the route loads, and a missing one fails with its name.

## Run it locally

From the repository root:

```sh
bun install
bun run build
cd examples/mailbox-agent-chat-sdk
bun run dev
```

Expose the server with a tunnel and point the mailbox webhook at `<tunnel URL>/api/samva`. Send
the mailbox an email, then approve or deny the held reply in the dashboard. The server logs
`Reply held for approval` with the action id.

## Checks

```sh
bun run typecheck
bun run test
bun run build
```

The test signs a delivery with `@samva/webhooks`, stubs `fetch`, and calls the route's `POST`. It
never contacts Samva.

## Deploy to Vercel

Deploy this directory as a Next.js project and set the three variables. The example keeps Chat
SDK state in memory, so use a shared state adapter such as `@chat-adapter/state-redis` when more
than one instance serves the route. See the [Vercel cookbook](../../cookbooks/vercel.md).

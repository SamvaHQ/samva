# Inbound email replies with Samva

Receive an inbound email reply, verify its signed webhook, read the conversation,
and answer on the same thread with Samva.

The runnable example lives in
[`examples/inbound-email-replies`](../examples/inbound-email-replies).
The tests mock the Samva API, so the whole flow runs without an account.

## Install

```sh
bun add samva
```

## Enable receiving

Point a domain at Samva, enable receiving with a catch-all rule, and attach the
webhook endpoint that should receive `message.received` events.

```ts
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const endpoint = await samva.webhooks.create({
  name: "Inbound replies",
  url: "https://app.example.com/webhooks/samva",
  eventTypes: ["message.received"],
  channels: ["email"],
});

await samva.email.enableReceiving({
  id: process.env.SAMVA_DOMAIN_ID!,
  domain: "replies.example.com",
  catchAll: true,
  endpointId: endpoint.endpoint.id,
});
```

A signing secret is returned only when the endpoint is created. Store it and read
it back from your secret manager on later runs. If a previous setup run lost it,
rotate it with `samva.webhooks.regenerateSecret`.

Setup should converge. List existing endpoints first, reuse the one named
`Inbound replies`, and reconcile its URL, event types, channels, and status with
`samva.webhooks.update`. That keeps a partial run from colliding with the
organization's unique endpoint name or delivering inbound mail to a stale
receiver.

## Verify the signed webhook

Read the raw request first. `verifyRequest` checks the Standard Webhooks
signature headers against the exact bytes, so parse JSON only after it resolves.

```ts
import { verifyRequest } from "samva/webhooks";

const verified = await verifyRequest(request, process.env.SAMVA_WEBHOOK_SECRET!);
if (verified.event.type !== "message.received") {
  return new Response(null, { status: 204 });
}
```

`verifyRequest` throws when the signature, timestamp, or secret is invalid.
Return a non-2xx status for an invalid signature so the sender retries or alerts.

## Read the conversation and reply in-thread

The event carries the inbound `messageId`, `conversationId`, and sender. Load the
conversation and its messages, then send with `conversationId` and
`inReplyToMessageId` so the reply joins the same thread.

```ts
const reply = verified.event.data as {
  messageId: string;
  conversationId: string;
  from: string;
  subject?: string;
  isAutoReply?: boolean;
};

if (reply.isAutoReply) {
  return new Response(null, { status: 204 });
}

const [conversation, messages] = await Promise.all([
  samva.conversations.getById({ id: reply.conversationId }),
  samva.conversations.listMessages({ id: reply.conversationId }),
]);

const sent = await samva.email.send(
  {
    conversationId: reply.conversationId,
    to: reply.from,
    subject: reply.subject ? `Re: ${reply.subject}` : "Re: your message",
    html: "<p>Thanks for your reply. We will follow up shortly.</p>",
    inReplyToMessageId: reply.messageId,
  },
  { headers: { "idempotency-key": verified.id } },
);
```

Ignore automatic responses such as out-of-office replies. Replying to one starts
a loop.

The event `data` is `unknown`. Validate the fields you rely on before use. The
example uses a small type guard for exactly this reason.

## Idempotency and retries

Webhook delivery is at least once and unordered. The same event can arrive more
than once, and a transient send failure can be retried.

- Keep a durable set of processed webhook ids with a unique constraint. Use
  `verified.id`, which is stable across retries.
- Pass that id as the `idempotency-key` header on the send.
- Record completion only after the send succeeds. A failed send stays
  unprocessed and can be retried.

An in-memory `Set` is fine for the example. Use a database table in production.

## Going live

After enabling receiving, publish the root MX record Samva proposes for the
domain. If an existing mailbox owns your primary MX route, use a dedicated
subdomain such as `replies.example.com`.

## Validate locally

The example installs the published SDK and injects a local `fetch`
implementation, so the tests never contact the Samva API:

```sh
bun --cwd examples/inbound-email-replies run typecheck
bun --cwd examples/inbound-email-replies run test
```

The suite covers setup convergence, a verified receive-and-reply, auto-reply
skipping, a subjectless fallback, retry after a failed send, and rejection of a
bad signature.

## Example

See the runnable
[`inbound-email-replies` example](../examples/inbound-email-replies) for the
complete `configureInboundEmail` and `handleInboundReply` implementation and its
HTTP seam.

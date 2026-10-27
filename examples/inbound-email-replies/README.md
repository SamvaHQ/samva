# Inbound email replies + Samva

This runnable TypeScript example receives an email reply, verifies its signed
webhook, reads the conversation and its messages, then sends a reply on the same
thread.

## Run the proof

From this directory:

```sh
bun install
bun run typecheck
bun run test
```

The test uses the published SDK surface with a local HTTP seam, so it verifies the
requests without sending email. To use the handler in your app, install `samva`,
create a client with your API key, and call `configureInboundEmail` after the
domain is verified:

```typescript
import { createClient } from "samva";

import { configureInboundEmail, handleInboundReply } from "./src/inbound";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const { endpoint } = await configureInboundEmail(samva, {
  domainId: process.env.SAMVA_DOMAIN_ID!,
  domain: "replies.example.com",
  webhookUrl: "https://app.example.com/webhooks/samva",
});

const processedWebhookIds = new Set<string>();

export async function POST(request: Request) {
  const result = await handleInboundReply(request, {
    samva,
    webhookSecret: endpoint.secret ?? process.env.SAMVA_WEBHOOK_SECRET!,
    processedWebhookIds,
  });
  return new Response(null, { status: result.accepted ? 204 : 200 });
}
```

A conversation the handler cannot read sends no reply. When `conversations.getById`
or `conversations.listMessages` throws, `handleInboundReply` returns
`{ accepted: false, reason }` and sends nothing:

- `ResourceNotFoundError` → `"not-found"`
- `ForbiddenError` → `"forbidden"`
- `UnauthorizedError` → `"unauthorized"`

The handler above answers `200`, so Samva does not deliver the same event again.
Retrying cannot make that read succeed. The webhook id stays out of
`processedWebhookIds` because no reply was sent. Any other read or send failure
still throws, so a transient error can be retried, and an invalid signature still
fails the request.

`configureInboundEmail` creates the endpoint on the first run and reconciles and
reuses it on later runs, so a partial setup converges. A signing secret is shown
only when the endpoint is created; if a previous run lost it, rotate it with
`samva.webhooks.regenerateSecret`.

Use durable storage with a unique constraint for `processedWebhookIds` in
production. Webhook delivery is at least once and unordered. Publish the root MX
record Samva proposes after enabling receiving, and use a dedicated subdomain if
an existing mailbox owns your primary MX route.

See the [inbound email cookbook](../../cookbooks/inbound-email.md) for the full
walkthrough.

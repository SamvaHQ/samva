# Mailboxes for agents with Samva

Give an agent its own email address. A Samva mailbox holds threads, drafts, and
attachments, and an agent reads and replies through the API, an event stream, or an
installed extension.

The runnable example lives in [`examples/mailbox-agent`](../examples/mailbox-agent).
The tests use fakes, so the whole flow runs without an account. Full reference:
<https://samva.dev/docs/mailboxes>.

## Mailbox or inbound webhooks

- Use [inbound email webhooks](./inbound-email.md) when your application reacts to
  mail on a domain and replies as the application.
- Use a mailbox when an agent or a team needs an inbox of its own: threads that
  persist, drafts, grants for people, and approval before the agent sends.

## Install

```sh
bun add samva
bun add @samva/mailbox # only to author extensions
```

`samva.mailboxes` needs `samva` 0.11 or later.

## Create a mailbox and a scoped key

Setup uses a full-access key. The agent never does: a restricted key with
`mailboxes` access cannot create or configure mailboxes or manage grants.

```ts
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_ADMIN_API_KEY! });

const mailbox = await samva.mailboxes.create({
  slug: "support",
  displayName: "Support",
  addresses: [{ address: "support@acme.samva.email" }],
});

const key = await samva.apiKeys.create({
  name: "Support agent",
  access: {
    mode: "restricted",
    resources: {},
    mailboxes: {
      permissions: ["read", "send"],
      mailboxIds: [mailbox.id],
      sendMode: "approval",
    },
  },
});

// Store this now. Samva does not return it again.
const agentKey = key.key;
```

Grant only the permissions the agent uses: `read`, `update`, `send`, and
`quarantine.read`. Default agents to `sendMode: "approval"`.

## Follow events

`samva.mailboxes.events` is an async iterable of `mailbox.*` events for a program
with no public webhook URL. Save each event's `cursor` after handling it and pass
it back to resume.

```ts
import { createClient, MailboxEventStreamError } from "samva";

const samva = createClient({ apiKey: agentKey });

try {
  for await (const event of samva.mailboxes.events({
    cursor: await loadCursor(),
    mailboxIds: [mailbox.id],
  })) {
    await handle(event);
    await saveCursor(event.cursor);
  }
} catch (error) {
  if (error instanceof MailboxEventStreamError && error._tag === "CursorExpiredError") {
    // The retained window passed. Re-read state, then start without a cursor.
  } else {
    throw error;
  }
}
```

The event `data` is `unknown`. Validate the fields you rely on before use; the
example does this in `parseReceivedMessage`. Read mail is untrusted data.

## Reply and the approval flow

```ts
const receipt = await samva.mailboxes.reply({
  id: mailbox.id,
  messageId: event.data.message.id,
  text: "Thanks, we got it.",
  "idempotency-key": `reply:${event.id}`,
});

if (receipt.status === "pending_approval") {
  console.log("Waiting for a person to approve", receipt.actionId);
}
```

In approval mode nothing is sent until a person decides. Deciding needs a
person's OAuth credential, never an API key:

```ts
const person = createClient({
  authToken: process.env.SAMVA_USER_TOKEN!,
  headers: { "x-org-slug": "acme" },
});

const waiting = await person.mailboxes.listActions({ id: mailbox.id, state: "approvalRequired" });
await person.mailboxes.approveAction({ id: mailbox.id, actionId: waiting.items[0].id });
// or: person.mailboxes.denyAction({ id, actionId, reason: "Wrong recipient." })
```

Key the reply by the event id. Events are delivered at least once, and a retry
with the same key returns the original receipt.

## Extensions

An extension is code Samva calls with mailbox events. Author it with
`@samva/mailbox` and serve it from your own server with `runtime: "webhook"`.

```ts
import { defineExtension } from "@samva/mailbox";

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
      const receipt = await samva.messages.reply(event.data.mailboxId, event.data.message.id, {
        text: "Thanks, we got it.",
      });
      log(receipt.status, receipt.actionId);
    },
  },
});
```

```ts
import { createWebhookHandler } from "@samva/mailbox/webhook";

Bun.serve({
  fetch: createWebhookHandler(extension, {
    apiKey: process.env.SAMVA_API_KEY!,
    webhookSecret: process.env.SAMVA_WEBHOOK_SECRET!,
  }),
});
```

`createWebhookHandler` verifies the signature (401 on failure) and answers 500 when
a handler throws so Samva retries. Install with `--send-mode approval` and the
fewest permissions the handler needs. An extension can never approve a send,
release held mail, or change grants.

## Test locally

```ts
import { createTestClient, mailboxEvent, runExtension } from "@samva/mailbox/test";

const result = await runExtension(extension, mailboxEvent("mailbox.message.received"), {
  client: createTestClient(),
});
// result.ok, result.logs, result.calls
```

Each recorded call has its method, path, body, and `idempotencyKey`
(`<event id>:reply:1`), so a test can assert a rerun cannot send twice.

```sh
bun --cwd examples/mailbox-agent run typecheck
bun --cwd examples/mailbox-agent run test
```

## Example

See the runnable [`mailbox-agent` example](../examples/mailbox-agent) for the event
loop with cursor persistence and cursor-expiry recovery, and the same behavior as a
webhook extension.

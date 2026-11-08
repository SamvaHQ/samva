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
```

These examples use `samva@^0.37.0`. Extension helpers are part of the SDK at
`samva/mailbox`, `samva/mailbox/test`, and `samva/mailbox/webhook`; the standalone
`@samva/mailbox` package is deprecated in its favour.

## Create a mailbox and a scoped key

Setup uses a person's OAuth session to create the mailbox, issue a restricted key, and set its
policy. The agent uses that restricted key; it cannot configure policies or approve actions.

```ts
import { createClient } from "samva";

const samva = createClient({
  authToken: process.env.SAMVA_USER_TOKEN!,
  orgSlug: process.env.SAMVA_ORG_SLUG!,
});

const mailbox = await samva.mailboxes.create({
  endpoint: { channel: "email", address: "support@acme.samva.email" },
  name: "Support",
});

const key = await samva.apiKeys.create({
  name: "Support agent",
  access: {
    mode: "restricted",
    resources: {},
    mailboxes: {
      permissions: ["read", "send"],
      mailboxIds: [mailbox.id],
    },
  },
});

const currentPolicy = await samva.policies.getPolicy({ kind: "apiKey", id: key.apiKey.id });
await samva.policies.setPolicy({
  kind: "apiKey",
  id: key.apiKey.id,
  ifVersion: currentPolicy.version,
  presets: [],
  rules: [{ match: { effect: "write" }, atLeast: "person" }],
});

// Store this now. Samva does not return it again.
const agentKey = key.key;
```

Policy replacement checks the version read above. A stale write returns `409`; reload and review the
current rules before replacing them again.

Grant only the permissions the agent uses: `read`, `update`, `send`, and
`quarantine.read`. Use a `write` minimum of `person` so sends and replies wait for review.

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
const receipt = await samva.mailboxes.reply(
  {
    id: mailbox.id,
    messageId: event.data.message.id,
    text: "Thanks, we got it.",
  },
  { idempotencyKey: `reply:${event.id}` },
);

if (receipt.state === "approvalRequired") {
  console.log("Waiting for a person to approve", receipt.actionId);
} else {
  const action = await samva.mailboxes.getAction({ id: mailbox.id, actionId: receipt.actionId });
  console.log(action.state);
}
```

Mailbox sends, replies, reply-all, forwards, and draft sends return a receipt with
`state`: `approvalRequired`, `queued`, `accepted`, `completed`, `notSent`, or `uncertain`.
HTTP 202 means the action is in progress. `messageId` and `acceptedAt` are null until
acceptance; `accepted` and `completed` do not mean recipient delivery. Follow the
same action with `mailboxes.getAction({ id, actionId })`; send actions include the
receipt under `send`. `approveAction` returns an action with this nested receipt.

Rate limits, sender readiness, and pending onboarding review queue the send for
automatic retry until `executeUntil`. Read `retryAt` and `problem.error._tag` for the
wait and its cause. Template operations report a transient template service failure as
`ServiceUnavailableError` (503) with `retryAfterSeconds` from the `Retry-After` header;
wait that long and reuse the same idempotency key for writes. Policy refusal returns 403,
validation 422, and competing actions 409. If a response is lost, repeat the same
idempotency key and body.
Do not submit a replacement send to recover accepted or uncertain work.

Only a permitted person can call `mailboxes.cancelAction({ id, actionId })` or
`mailboxes.retryAction({ id, actionId })`. Cancel requires a definitely unsent action;
retry requires an eligible ended execution and preserves the content and deadline. It stays
unavailable while cleanup from an ended attempt is still running, and while an attempt's status
is unknown. Check `retryEligible` on the receipt. Automatic waits need no manual retry.

A held send waits until a person decides. Deciding needs a
person's OAuth credential, never an API key:

```ts
const person = createClient({
  authToken: process.env.SAMVA_USER_TOKEN!,
  orgSlug: process.env.SAMVA_ORG_SLUG!,
});

const waiting = await person.mailboxes.listActions({ id: mailbox.id, state: "approvalRequired" });
const held = waiting.items[0];
if (!held?.decision) throw new Error("No held decision to review");
await person.mailboxes.approveAction({
  id: mailbox.id,
  actionId: held.id,
  reviewRound: held.decision.reviewRound,
});
// Denial also requires that observed round:
// person.mailboxes.denyAction({ id: mailbox.id, actionId: held.id,
//   reviewRound: held.decision.reviewRound, reason: "Wrong recipient." });
// A stale round returns 409. Read and review the new hold before deciding again.
```

Key the reply by the event id. Events are delivered at least once, and a retry
with the same key and body returns the original action's current receipt.

## Extensions

An extension is code Samva calls with mailbox events. Author it with
`samva/mailbox` and serve it from your own server with `runtime: "webhook"`.

```ts
import { defineExtension } from "samva/mailbox";

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
      const receipt = await samva.mailboxes.reply({
        id: event.data.mailboxId,
        messageId: event.data.message.id,
        text: "Thanks, we got it.",
      });
      log(receipt.state, receipt.actionId);
    },
  },
});
```

```ts
import { createWebhookHandler } from "samva/mailbox/webhook";

Bun.serve({
  fetch: createWebhookHandler(extension, {
    apiKey: process.env.SAMVA_API_KEY!,
    webhookSecret: process.env.SAMVA_WEBHOOK_SECRET!,
  }),
});
```

`createWebhookHandler` verifies the signature (401 on failure) and answers 500 when
a handler throws so Samva retries. Install with
`--policy '{"presets":[],"rules":[{"match":{"effect":"write"},"atLeast":"person"}]}'`
and the fewest permissions the handler needs. An extension can never approve a send,
release held mail, or change grants.

## Test locally

```ts
import { createTestClient, mailboxEvent, runExtension } from "samva/mailbox/test";

const result = await runExtension(extension, mailboxEvent("mailbox.message.received"), {
  client: createTestClient(),
});
// result.ok, result.logs, result.calls
```

Each recorded call has its method, path, body, and `idempotencyKey`
(`<event id>:reply:1`), so a test can assert a rerun cannot send twice.

A send key is derived per run, so a handler that makes the same calls in the same order reuses
them after a retry. Pass `{ idempotencyKey }` as the call's second argument when a different
deduplication window is needed.

```sh
bun --cwd examples/mailbox-agent run typecheck
bun --cwd examples/mailbox-agent run test
```

## Example

See the runnable [`mailbox-agent` example](../examples/mailbox-agent) for the event
loop with cursor persistence and cursor-expiry recovery, and the same behavior as a
webhook extension.

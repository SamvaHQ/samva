# Mailboxes for agents with Samva

Give an agent its own email address. A Samva mailbox holds threads, drafts, and
attachments, and an agent reads and replies through the API, an event stream, or an
agent module that Samva runs on each event.

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

These examples use `samva@^0.48.0`. Agent module helpers are part of the SDK at `samva/agent`
and `samva/agent/test`, which need `effect` at runtime. To add an agent module to an existing
project, install it too (`samva agents init` adds it for a new one):

```sh
bun add samva effect
```

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

const currentPolicy = await samva.policies.getPolicy({ kind: "apiKey", id: key.id });
await samva.policies.setPolicy({
  kind: "apiKey",
  id: key.id,
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
`spam.read`. The hosted API names the held-malware grant `spam.read`, but `samva@0.48.0` still
types it `quarantine.read`, so grant the first three with that version. Use a `write` minimum of `person` so sends and replies
wait for review.

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
idempotency key and body. A reply or send that reuses a key with a different body is refused with
`MailboxSendConflictError`, which carries the first send's `receipt`; treat it as already
submitted. Any other conflict, such as a paused mailbox, recorded nothing and is a failure.
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

## Agent modules

An agent module is code Samva runs on mailbox events. Author it with `defineAgent` from
`samva/agent`, register a handler under `events`, and publish it with the CLI.

```ts
import { defineAgent } from "samva/agent";

export default defineAgent({
  manifest: {
    name: "Reply agent",
    version: "1.0.0",
    endpointIds: ["mbe_..."],
    integrations: [],
    eventTriggers: [],
    policy: { presets: [], rules: [{ match: { effect: "write" }, atLeast: "person" }] },
    model: "standard",
    reasoning: "auto",
    workingHours: null,
    takeoverTimeoutMinutes: 30,
  },
  instructions: "Acknowledge incoming mail through the registered event handler.",
  events: {
    "mailbox.message.received": async (event, ctx) => {
      const receipt = await ctx.samva.mailboxes.reply({
        id: event.data.mailboxId,
        messageId: event.data.message.id,
        text: "Thanks, we got it.",
      });
      ctx.log(receipt.state, receipt.actionId);
    },
  },
});
```

```sh
samva agents init ./reply-agent --name "Reply agent"
samva agents info ./reply-agent
AGENT_ID=$(samva agents create "Reply agent" --json | jq -r .data.id)
samva agents publish "$AGENT_ID" --dir ./reply-agent
```

A handler gets the event and a per-call `ctx`. In a mailbox handler `ctx.samva` reads the
event's mailbox and replies to the received message; any other operation fails with HTTP 403. A
handler that throws is retried with the same event id, so keep it safe to repeat. The manifest's
`policy` holds each write for a person, and an agent can never approve a send, release held mail,
or change grants. To receive events on your own server instead, use a
[webhook](https://samva.dev/docs/platform/webhooks). Reference:
<https://samva.dev/docs/agents#event-handlers>.

## Test locally

```ts
import { createTestClient, runAgent } from "samva/agent/test";

const client = createTestClient();
await runAgent(agent, ctx(client)).event({
  id: "evt_01",
  type: "mailbox.message.received",
  timestamp: "2026-10-10T12:00:00.000Z",
  data: { mailboxId: "mbx_01", message: { id: "msg_01" } },
});
// client.calls records each request's method, path, body, and idempotencyKey
```

`ctx` is the fake per-call context your test builds: a capability, `client` as `samva`, and a
`log` collector. The runnable example builds one in
[`tests/agent-module.test.ts`](../examples/mailbox-agent/tests/agent-module.test.ts).

In a published module, a write's idempotency key derives from the agent, event, operation, and
call order, so a handler that makes the same calls in the same order reuses them after a retry.
Pass `{ idempotencyKey }` as the call's second argument when a different deduplication window is
needed.

```sh
bun --cwd examples/mailbox-agent run typecheck
bun --cwd examples/mailbox-agent run test
```

## Example

See the runnable [`mailbox-agent` example](../examples/mailbox-agent) for the event
loop with cursor persistence and cursor-expiry recovery, and the same behavior as an
agent module.

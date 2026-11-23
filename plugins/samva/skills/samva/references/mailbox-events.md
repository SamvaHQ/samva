# Mailboxes and events

Read mail with `samva.mailboxes` and `samva mailboxes`; the [sdk](sdk.md), [cli](cli.md), and
[mcp](mcp.md) references cover the calls. Docs: <https://samva.dev/docs/mailboxes>.

## React to mailbox events with code

Run code on a mailbox event with an agent's `events` handlers; docs:
<https://samva.dev/docs/agents#event-handlers>. `samva/agent` needs `effect` at runtime:
`samva agents init` adds it, and an existing project installs it with `bun add samva effect`.

```typescript
import { defineAgent } from "samva/agent";

export default defineAgent({
  manifest: {
    name: "Acknowledger",
    version: "1.0.0",
    endpointIds: ["mbe_..."],
    integrations: [],
    eventTriggers: [],
    policy: { presets: [], rules: [] },
    model: "standard",
    reasoning: "auto",
    workingHours: null,
    takeoverTimeoutMinutes: 30,
  },
  instructions: "Acknowledge new mail.",
  events: {
    "mailbox.message.received": async (event, ctx) => {
      ctx.log("received", event.id);
    },
  },
});
```

- Event types: `mailbox.message.received`, `mailbox.message.sent`,
  `mailbox.action.pending_approval`, `mailbox.action.resolved`, and `mailbox.thread.deleted`. A custom contact event name runs the
  handler registered under that name, with `data` of `contactId`, `properties`, and `source`.
- A handler gets `(event, ctx)`. In a mailbox handler `ctx.samva` reads and replies within the
  event's mailbox. A contact handler has no Samva authority. `ctx.connections` and `ctx.memory`
  refuse in event handlers. Network access is open.
- Registering `mailbox.message.received` makes the handler own that inbound message: no automatic
  agent reply starts for it, and the message still joins the history.
- Samva retries a throwing handler up to five attempts with the same event id. SDK writes derive
  stable idempotency keys, so keep write order stable; other side effects need their own
  deduplication.
- Test with `runAgent(agent, ctx).event(event)` from `samva/agent/test`. Publish with
  `samva agents publish`.
- To receive events on your own server, use a webhook (`samva webhooks`).

## Approvals and held mail

An agent can never approve a send, release or discard held mail, or change grants and keys. Sends
that need a person return `approvalRequired`. See <https://samva.dev/docs/mailboxes/approvals>
and <https://samva.dev/docs/mailboxes/spam>. Spam delivery sends metadata to subscribed webhooks and scoped stream credentials. Agents get the normal received event when a reader restores newly admitted mail.

# Mailbox agent + Samva

A runnable TypeScript example of an agent that owns a Samva mailbox and answers email and WhatsApp
from it. It shows the same behavior
two ways:

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox, saves the stream cursor after
  each handled event, and drafts a reply to every `mailbox.message.received`. It restarts without a
  cursor when the retained window has passed (`CursorExpiredError`).
- `src/agent-module.ts` is the same behavior as a `samva/agent` module: a
  `mailbox.message.received` handler under `events` that Samva runs for each event on the
  mailbox, published with `samva agents publish`.

The "agent" decision (`composeReply` in `src/reply.ts`) is a deterministic function so the example
stays about mailbox mechanics. Replace it with your own logic.

## Safety stance

- **Decision rules.** Set a mailbox-scoped key policy, or the module's manifest `policy`, with
  `{ match: { effect: "write" }, atLeast: "person" }`. Policy reads return `version`; replacements must send that value as `ifVersion`. Reload and review current rules after a `409` conflict. A reply returns `state: "approvalRequired"` and an `actionId`; nothing is
  sent until a person approves it with a person's OAuth credential in the dashboard, the CLI
  (`samva login`), or `samva.mailboxes.approveAction`. Approval and denial carry the observed
  `decision.reviewRound`; CLI commands require `--review-round`. An API key can never approve a send.
- **Least privilege.** The module registers one handler, and its `ctx.samva` reads the event's
  mailbox and replies to the received message; any other operation fails with HTTP 403. The key
  reaches one mailbox.
- **Fail loudly.** Missing `SAMVA_API_KEY` or `SAMVA_MAILBOX_ID` stops the agent at startup. The module holds no
  secrets: Samva gives each call its own `ctx`.
- **Mail is untrusted data.** The example never interprets message bodies as instructions.
- **Idempotent replies.** The agent keys each reply by event id; the module's SDK client derives the
  `Idempotency-Key` from the agent, event, and call order. Redelivery cannot send twice.

Replies return send receipts, and the example logs each receipt's `state`. Follow the action
with `mailboxes.getAction` — a handler's `ctx.samva` is the normal client, so it calls the
same method — to see it progress.
`queued` is waiting for acceptance; `accepted` and `completed` do not mean recipient
delivery. `messageId` and `acceptedAt` remain null until acceptance. Follow the
action rather than submitting another reply. A lost response is recovered with
the same idempotency key and body. `retryAction` is only for an action whose
`retryEligible` is true: it preserves the original delays and deadline, and it
stays false while cleanup from an ended attempt is pending or the attempt's
status is unknown.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use a fake event stream, the Samva client with a mocked HTTP transport, and
`samva/agent/test`. They never contact Samva.

## Run the event-stream agent

Use a person's OAuth session to create the mailbox and a restricted key with a `write` minimum
of `person` (see the
[mailboxes cookbook](../../cookbooks/mailboxes.md)).

```sh
SAMVA_API_KEY=samva_sk_test_... SAMVA_MAILBOX_ID=mbx_... bun run agent
```

The example keeps the cursor in memory, so a restart resumes live. Persist it in a database or file
in production so a restart replays what it missed.

## Answer WhatsApp from the same mailbox

A mailbox can hold a WhatsApp number next to its email address, and the agent needs no second
integration: a customer's WhatsApp message arrives as the same `mailbox.message.received` event
with `message.channel: "whatsapp"`, and `mailboxes.reply` answers it with `channel: "whatsapp"`.
The same decision rules hold the reply for a person.

Add a number your organization has connected as an endpoint on the mailbox
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)):

```sh
curl -X POST https://api.samva.dev/v1/mailboxes/mbx_.../endpoints \
  -H "X-API-Key: $SAMVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "channel": "whatsapp", "address": "+16175550123" }'
```

Free-form text needs the 24-hour service window that a customer's message opens. The agent replies
to a message it has just received, so the window is open; if a replayed event finds it closed, the
API refuses the text with `WhatsAppServiceWindowClosedError` and the agent logs and skips it.
Reaching the customer then takes an approved template (`templateId` and `templateData` in place of
`text`). WhatsApp needs a paid plan.

## Publish the agent module

Set `endpointIds` in `src/agent-module.ts` to your mailbox's endpoint id, then check and publish
the module as an agent's next version:

```sh
samva agents info . --entry src/agent-module.ts
samva agents publish "$AGENT_ID" --dir . --entry src/agent-module.ts
```

`info` validates the manifest and lists the registered handlers; `publish` bundles the module with
`samva agents build` and publishes it. Samva runs the handler on each `mailbox.message.received`
event for the mailbox without a model turn, and the manifest's `policy` holds each reply for a
person. To receive events on your own server instead, use a [webhook](https://samva.dev/docs/platform/webhooks).

| Variable           | Used by | Meaning                                         |
| ------------------ | ------- | ----------------------------------------------- |
| `SAMVA_API_KEY`    | agent   | Mailbox-scoped key whose writes wait for review |
| `SAMVA_MAILBOX_ID` | agent   | The mailbox to follow                           |

See the [mailboxes cookbook](../../cookbooks/mailboxes.md) and
<https://samva.dev/docs/mailboxes>.

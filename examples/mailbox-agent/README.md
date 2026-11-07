# Mailbox agent + Samva

A runnable TypeScript example of an agent that owns a Samva mailbox. It shows the same behavior
two ways:

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox, saves the stream cursor after
  each handled event, and drafts a reply to every `mailbox.message.received`. It restarts without a
  cursor when the retained window has passed (`CursorExpiredError`).
- `src/extension.ts` is the same behavior as a `samva/mailbox` extension with
  `runtime: "webhook"`, served by `src/server.ts` through `createWebhookHandler`.

The "agent" decision (`composeReply` in `src/reply.ts`) is a deterministic function so the example
stays about mailbox mechanics. Replace it with your own logic.

## Safety stance

- **Decision rules.** Set a mailbox-scoped key policy, or an extension installation policy, with
  `{ match: { effect: "write" }, atLeast: "person" }`. Policy reads return `version`; replacements must send that value as `ifVersion`. Reload and review current rules after a `409` conflict. A reply returns `state: "approvalRequired"` and an `actionId`; nothing is
  sent until a person approves it with a person's OAuth credential in the dashboard, the CLI
  (`samva login`), or `samva.mailboxes.approveAction`. Approval and denial carry the observed
  `decision.reviewRound`; CLI commands require `--review-round`. An API key can never approve a send.
- **Least privilege.** The extension asks for `read` and `send` only, on the one event it handles.
  The key reaches one mailbox.
- **Fail loudly.** Missing `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, or `SAMVA_WEBHOOK_SECRET` stops the
  process at startup. The webhook handler verifies the signature on every request.
- **Mail is untrusted data.** The example never interprets message bodies as instructions.
- **Idempotent replies.** The agent keys each reply by event id; the extension client derives the
  `Idempotency-Key` from the event id. Redelivery cannot send twice.

Replies return send receipts, and the example logs each receipt's `state`. Follow the action
with `mailboxes.getAction` — a `samva/mailbox` handler receives the normal client, so it calls the
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
`samva/mailbox/test`. They never contact Samva.

## Run the event-stream agent

Use a person's OAuth session to create the mailbox and a restricted key with a `write` minimum
of `person` (see the
[mailboxes cookbook](../../cookbooks/mailboxes.md)).

```sh
SAMVA_API_KEY=samva_sk_test_... SAMVA_MAILBOX_ID=mbx_... bun run agent
```

The example keeps the cursor in memory, so a restart resumes live. Persist it in a database or file
in production so a restart replays what it missed.

## Run the webhook extension

```sh
SAMVA_API_KEY=samva_sk_test_... SAMVA_WEBHOOK_SECRET=whsec_... bun run serve
```

Publish and install the extension with the Samva CLI (`samva extensions`), installing with
`--policy '{"presets":[],"rules":[{"match":{"effect":"write"},"atLeast":"person"}]}'`. Extension helpers ship in the `samva` package at `samva/mailbox`,
`samva/mailbox/test`, and `samva/mailbox/webhook`; `@samva/mailbox` is deprecated. The install
returns the key and signing secret once. Point the installation at the public URL of this server.

| Variable               | Used by       | Meaning                                         |
| ---------------------- | ------------- | ----------------------------------------------- |
| `SAMVA_API_KEY`        | agent, server | Mailbox-scoped key whose writes wait for review |
| `SAMVA_MAILBOX_ID`     | agent         | The mailbox to follow                           |
| `SAMVA_WEBHOOK_SECRET` | server        | Signing secret for the extension installation   |
| `PORT`                 | server        | Listen port, default `3000`                     |

See the [mailboxes cookbook](../../cookbooks/mailboxes.md) and
<https://samva.dev/docs/mailboxes>.

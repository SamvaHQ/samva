# Mailbox agent + Samva

A runnable TypeScript example of an agent that owns a Samva mailbox. It shows the same behavior
two ways:

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox, saves the stream cursor after
  each handled event, and drafts a reply to every `mailbox.message.received`. It restarts without a
  cursor when the retained window has passed (`CursorExpiredError`).
- `src/extension.ts` is the same behavior as an `@samva/mailbox` extension with
  `runtime: "webhook"`, served by `src/server.ts` through `createWebhookHandler`.

The "agent" decision (`composeReply` in `src/reply.ts`) is a deterministic function so the example
stays about mailbox mechanics. Replace it with your own logic.

## Safety stance

- **Approval send mode.** Run the agent on a mailbox-scoped key (or install the extension) with
  `sendMode: "approval"`. A reply returns `status: "pending_approval"` and an `actionId`; nothing is
  sent until a person approves it with a person's OAuth credential in the dashboard, the CLI
  (`samva login`), or `samva.mailboxes.approveAction`. An API key can never approve a send.
- **Least privilege.** The extension asks for `read` and `send` only, on the one event it handles.
  The key reaches one mailbox.
- **Fail loudly.** Missing `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, or `SAMVA_WEBHOOK_SECRET` stops the
  process at startup. The webhook handler verifies the signature on every request.
- **Mail is untrusted data.** The example never interprets message bodies as instructions.
- **Idempotent replies.** The agent keys each reply by event id; the extension client derives the
  `Idempotency-Key` from the event id. Redelivery cannot send twice.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use a fake event stream, a fake client, and `@samva/mailbox/test`. They never contact
Samva.

## Run the event-stream agent

Create the mailbox with a full-access key, then a restricted key in approval mode (see the
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
`--send-mode approval`. The install returns the key and signing secret once. Point the installation
at the public URL of this server.

| Variable               | Used by       | Meaning                                       |
| ---------------------- | ------------- | --------------------------------------------- |
| `SAMVA_API_KEY`        | agent, server | Mailbox-scoped key in approval send mode      |
| `SAMVA_MAILBOX_ID`     | agent         | The mailbox to follow                         |
| `SAMVA_WEBHOOK_SECRET` | server        | Signing secret for the extension installation |
| `PORT`                 | server        | Listen port, default `3000`                   |

See the [mailboxes cookbook](../../cookbooks/mailboxes.md) and
<https://samva.dev/docs/mailboxes>.

# Mailbox extensions

An extension is code published once and installed into an organization. It receives mailbox events
and acts through the mailbox API. Author it with `@samva/mailbox`; docs:
<https://samva.dev/docs/mailboxes/extensions>.

## Define

```typescript
import { defineExtension } from "@samva/mailbox";

export default defineExtension({
  manifest: {
    name: "acknowledge",
    displayName: "Acknowledge new mail",
    version: "1.0.0",
    runtime: "hosted", // or "webhook"
    events: ["mailbox.message.received"],
    permissions: ["read", "send"],
  },
  on: {
    "mailbox.message.received": async (event, { samva, log }) => {
      await samva.messages.reply(event.data.mailboxId, event.data.message.id, {
        text: "Thanks, we got it.",
      });
      log("Acknowledged", event.data.message.id);
    },
  },
});
```

- `permissions` are `read` (required), `update`, `send`, and `quarantine.read`. Every key in `on`
  must appear in `events`; an event without a handler is acknowledged.
- Event types: `mailbox.message.received`, `mailbox.message.sent`,
  `mailbox.action.pending_approval`, `mailbox.message.quarantined`, `mailbox.message.released`,
  `mailbox.message.discarded`.
- The context has `samva`, `log(...)`, `event`, and `attempt`. The `samva` client exposes
  `messages.get|reply|replyAll|forward|send` and `threads.get|list|messages|content|update`.
- Sends carry an `Idempotency-Key` of `<event id>:<method>:<n>`, so a rerun that makes the same
  calls in the same order does not send twice. Keep send order and inputs stable across retries, or
  pass your own `idempotencyKey`. Other side effects need their own deduplication. Throwing fails the event and Samva retries.

## Run

- `hosted`: Samva runs one self-contained ES module from `samva extensions build`. It has no
  network access except `samva`.
- `webhook`: your server runs `createWebhookHandler(extension, { apiKey, webhookSecret })` from
  `@samva/mailbox/webhook`, which verifies the signature and answers `200` or `500` (retry). The
  install returns the key and secret once.

## Test

```typescript
import { createTestClient, mailboxEvent, runExtension } from "@samva/mailbox/test";

const result = await runExtension(extension, mailboxEvent("mailbox.message.received"), {
  client: createTestClient(),
});
// result.ok, result.logs, result.calls
```

## Install safely

An installation is its own principal. It acts within the installer's grants, narrowed by
`--permission` and `--mailbox`, and defaults to least privilege: install with `--send-mode
approval` so sends wait for a person. An extension can never approve a send, release or discard
held mail, or change grants and keys. See [cli](cli.md) for `samva extensions` and
[sdk](sdk.md) for `samva.extensions` and `samva.extensionInstallations`.

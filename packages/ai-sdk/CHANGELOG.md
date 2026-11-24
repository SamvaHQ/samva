## @samva/ai-sdk@0.2.0

### Requires `samva@^0.51.0`

Every Samva integration package now supports `samva@^0.51.0` and no longer accepts 0.50. Install it next to the package:

```sh
npm install samva@^0.51.0
```

If you call the SDK yourself beside these packages, read the `samva` 0.51 release notes. `email.enableReceiving` takes the domain id alone, scheduled-message, campaign and API key responses no longer carry a member's email, and every SDK request attempt now times out after 30 seconds unless you set `timeoutMs`.

### Tool results are shaped for the model

The mailbox tools now return what an agent acts on instead of the raw API response, so the model reads fewer tokens and less untrusted markup.

- `get_thread` returns `{ threadId, items, nextCursor }`. Each item has the message `id`, `channel`, `direction`, `occurredAt`, `from` (`address`, `name`), `to`, `text`, and `attachments` (`name`, `type`); email items add `subject` and `cc` when anyone was copied; WhatsApp and SMS items add `template` for an outbound template message and `contextMessageId` for the message they quote or react to. `text` is the reply without its quoted history when Samva could separate it. HTML bodies, headers, authentication results, campaign attribution and actor references are gone.
- `search_threads` returns `{ items, nextCursor }` with each thread's `id`, `channel`, `subject`, `preview`, `from`, `messageCount`, `folder`, `lastActivityAt`, and `spam: { reason }` for a thread in Spam.
- `reply_to_customer` returns `{ status, receipt }` where `receipt` keeps `actionId`, `state`, `messageId`, `threadId`, `waitReason`, `retryAt`, `reviewExpectedAt`, `executeUntil`, `skippedRecipients`, `problem` (`code`, `message`), and `decision` (`outcome`, `decider`, `reason`). Read the full action with `samva.mailboxes.getAction({ id, actionId })`.

The package exports the new result types: `SamvaReplyReceipt`, `SamvaThreadContent`, `SamvaThreadMessage`, `SamvaThreadList`, `SamvaThreadSummary`, `SamvaParticipant`, and `SamvaAttachment`. `@samva/eve` passes the same results to its model.

## @samva/ai-sdk@0.1.3

### Requires `samva@^0.50.0`

Every Samva integration package now supports `samva@^0.50.0` and no longer accepts 0.48. Install it next to the package:

```sh
npm install samva@^0.50.0
```

If you call the SDK yourself beside these packages, read the `samva` 0.49 and 0.50 release notes. Spam replaces quarantine, inbound attachment downloads need a passing malware scan, and mailbox history import now uploads in parts.

## @samva/ai-sdk@0.1.2

### Point npm at each package's docs

Each package's npm `homepage` now links to its guide on samva.dev, and its keywords name the frameworks it works with. The READMEs show the Samva mark and npm badges, the AI SDK example uses `isStepCount`, and the Chat SDK adapter README follows the standard Chat SDK sections: installation, usage, environment variables, configuration, platform setup, features, and license.

## @samva/ai-sdk@0.1.1

### Require samva 0.48

The packages now declare `samva@^0.48.0` as a peer, and the Chat SDK adapter and Eve extension depend on `@samva/webhooks@^0.48.0`. Install them alongside `samva@0.48`.

## @samva/ai-sdk@0.1.0

### Connect mailbox agents to AI SDK, Chat SDK, and Eve

Use inbound-bound AI SDK tools, a Chat SDK adapter for signed email and WhatsApp webhooks, or an Eve extension that bundles both.

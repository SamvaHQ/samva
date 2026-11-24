---
packages:
  "@samva/ai-sdk": minor
  "@samva/eve": minor
---

## Tool results are shaped for the model

The mailbox tools now return what an agent acts on instead of the raw API response, so the model reads fewer tokens and less untrusted markup.

- `get_thread` returns `{ threadId, items, nextCursor }`. Each item has the message `id`, `channel`, `direction`, `occurredAt`, `from` (`address`, `name`), `to`, `text`, and `attachments` (`name`, `type`); email items add `subject` and `cc` when anyone was copied; WhatsApp and SMS items add `template` for an outbound template message and `contextMessageId` for the message they quote or react to. `text` is the reply without its quoted history when Samva could separate it. HTML bodies, headers, authentication results, campaign attribution and actor references are gone.
- `search_threads` returns `{ items, nextCursor }` with each thread's `id`, `channel`, `subject`, `preview`, `from`, `messageCount`, `folder`, `lastActivityAt`, and `spam: { reason }` for a thread in Spam.
- `reply_to_customer` returns `{ status, receipt }` where `receipt` keeps `actionId`, `state`, `messageId`, `threadId`, `waitReason`, `retryAt`, `reviewExpectedAt`, `executeUntil`, `skippedRecipients`, `problem` (`code`, `message`), and `decision` (`outcome`, `decider`, `reason`). Read the full action with `samva.mailboxes.getAction({ id, actionId })`.

The package exports the new result types: `SamvaReplyReceipt`, `SamvaThreadContent`, `SamvaThreadMessage`, `SamvaThreadList`, `SamvaThreadSummary`, `SamvaParticipant`, and `SamvaAttachment`. `@samva/eve` passes the same results to its model.

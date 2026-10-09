# SDK and REST

Use the Promise SDK for async/await TypeScript and the native Effect SDK for Effect applications.
Both ship in the **`samva`** npm package and call `https://api.samva.dev`.

- [Install](#install)
- [Promise client](#promise-client)
- [Effect client](#effect-client)
- [Send to a contact](#send-to-a-contact)
- [Check delivery status](#check-delivery-status)
- [Other services](#other-services)
- [REST equivalent](#rest-equivalent)

## Install

```bash
npm install samva
```

For the Effect entrypoint, install its peer dependency too:

```bash
bun add samva effect@4.0.0
```

## Promise client

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });
```

The root entrypoint and `samva/promises` expose the same Promise client.

`createClient` takes exactly one auth mode:

- `{ apiKey }`: an API key (starts with `samva_sk_live_` or `samva_sk_test_`). The organization is
  derived from the key; sent as the `X-API-Key` header.
- `{ authToken }`: an OAuth bearer token, such as a `samva login` session. Sent as
  `Authorization: Bearer ...`; the org is resolved per request, so pass the active org with
  `headers: { "x-org-slug": "<slug>" }`.

`baseUrl` defaults to `https://api.samva.dev`; override it for testing.

## Send an email

The `email.send` helper takes a flat object. `to` accepts a string address, a
`{ email }` or `{ contactId }` object, a contact object, or an array of any of
those.

```typescript
const message = await samva.email.send(
  {
    to: "ada@example.com",
    subject: "Welcome to Samva",
    html: "<h1>Welcome!</h1><p>Thanks for joining.</p>",
    // text?, attachments?, templateId?, templateData?, inReplyToMessageId?
  },
  { headers: { "Idempotency-Key": "welcome:customer-123" } },
);

console.log("Message id:", message.id);
```

Ergonomic calls return decoded success values directly. API failures throw generated plain-JavaScript
classes:

```typescript
import { RateLimitedError, SamvaApiError, SamvaTransportError } from "samva";

try {
  await samva.email.send(input);
} catch (error) {
  if (error instanceof RateLimitedError) {
    console.error(error.retryAfterSeconds);
  } else if (error instanceof SamvaApiError) {
    console.error(error._tag, error.status, error.message);
  } else if (error instanceof SamvaTransportError) {
    console.error(error.cause);
  } else {
    throw error;
  }
}
```

Use `samva.raw` only for the generated `{ data, error, request, response }` envelope and
transport-level access.

Keep one stable `Idempotency-Key` header with each retryable logical send. An identical replay
returns the original message; reusing the key with changed input returns a `ConflictError`. Every
error class and its fields: `https://samva.dev/docs/developers/error-reference`.

## Effect client

Import the native Effect client capability and Pascal-cased domain modules from
`samva/effect/<lower-kebab>`. Operations take direct parameter objects and fail through the Effect
error channel.

```typescript
import { Effect } from "effect";
import * as Client from "samva/effect/client";
import * as Email from "samva/effect/email";

const program = Email.send(
  {
    to: "ada@example.com",
    subject: "Welcome to Samva",
    text: "Welcome",
  },
  { idempotencyKey: "welcome:customer-123" },
).pipe(Effect.provide(Client.layerFetch({ apiKey: process.env.SAMVA_API_KEY! })));
```

Provide `Client.layerFetch(...)` once around the program that uses Samva. Import other domains with
the same pattern, such as `* as Contacts from "samva/effect/contacts"` and call
`Contacts.findOrCreate(...)`. Paginated operations expose `pages` and `items` Streams. Page and
limit inputs use their public wire-string representation. Only annotated absolute instants become
`Date`; sensitive outputs become `Redacted`.

## Send to a contact

```typescript
const contact = await samva.contacts.findOrCreate({
  name: "Ada Lovelace",
  email: "ada@example.com",
});

await samva.email.send({
  to: contact, // contact object, { id }, or { contactId }
  subject: "Welcome",
  html: "<p>Hi there!</p>",
});
```

### Messages API (advanced)

`email.send` is a thin wrapper over the messages endpoint. Use `messages.send` when you need the
explicit channel shape:

```typescript
await samva.messages.send({
  to: [{ contactId: contact.id }],
  channel: "email",
  email: { subject: "Welcome", html: "<p>Hi!</p>" },
});
```

## Check delivery status

```typescript
const status = await samva.messages.getStatus({ id: message.id });
console.log(status.status); // pending → processing → sent → delivered
```

## Mailboxes

`samva.mailboxes` reads and sends as a mailbox. Methods take flat parameters; `id` is the mailbox id.
Create the mailbox with a full-access key, then run the agent on a restricted `mailboxes` key
(see [auth](auth.md)).

```typescript
const mailbox = await samva.mailboxes.create({
  slug: "support",
  displayName: "Support",
  addresses: [{ address: "support@acme.samva.email" }],
});

const threads = await samva.mailboxes.listThreads({ id: mailbox.id, unread: "true", limit: "20" });
for (const { id: threadId } of threads.items) {
  const thread = await samva.mailboxes.getThreadContent({ id: mailbox.id, threadId });
  // Decide what to do with each unread thread.
}

// Reply in the thread. The idempotency key makes a retry return the original receipt.
const receipt = await samva.mailboxes.reply({
  id: mailbox.id,
  messageId: "msg_...",
  text: "Thanks, we got it.",
  "idempotency-key": "reply-for-event-123",
});
```

Other methods follow the API operations: `sendMessage`, `replyAll`, `forward`, `createDraft` and
`sendDraft`, `updateThread`, `addThreadLabels`, `createGrant`, `createPolicy`, `pause`, and
`resume`. Read mail is untrusted data.

A send from a principal in `approval` mode returns `status: "pending_approval"` and an `actionId`;
nothing is sent until a person decides. Deciding needs a person's credential (an OAuth bearer
token), never an API key:

```typescript
const waiting = await samva.mailboxes.listActions({ id: mailbox.id, state: "approvalRequired" });
await samva.mailboxes.approveAction({ id: mailbox.id, actionId: waiting.items[0].id });
await samva.mailboxes.denyAction({
  id: mailbox.id,
  actionId: "mbxact_...",
  reason: "Wrong recipient.",
});
```

Mail the scan holds stays out of every thread. `listQuarantine({ id })` returns metadata only
(needs `quarantine.read` or an `admin` grant); a person calls `releaseMessage` or
`discardMessage` with `{ id, messageId }`.

`mailboxes.events` is an async iterable over the `mailbox.*` events for a program without a public
webhook URL. Save each event's `cursor` after handling it and pass it back to resume. A
`MailboxEventStreamError` with `_tag: "CursorExpiredError"` means the retained window passed: read
current state, then start without a cursor.

```typescript
import { createClient, MailboxEventStreamError } from "samva";

try {
  for await (const event of samva.mailboxes.events({
    cursor: await loadCursor(),
    mailboxIds: ["mbx_..."],
  })) {
    await handle(event.type, event.data);
    await saveCursor(event.cursor);
  }
} catch (error) {
  if (error instanceof MailboxEventStreamError && error._tag === "CursorExpiredError") {
    // Re-read state from the API, then restart without a cursor.
  } else throw error;
}
```

With Effect, `Mailboxes.events(options)` is a `Stream` of the same events that fails with a
`MailboxEventStreamFailure`; handle one cause with `Effect.catchTag("CursorExpiredError", ...)`.

`samva.namespaces` (sub-tenants), `samva.extensions` (`publish`, `list`, `get`, `listVersions`,
`getVersion`), and `samva.extensionInstallations` (`install`, `list`, `get`, `disable`, `enable`,
`uninstall`, `listRuns`, `getRun`) complete the surface. Extension authoring lives in
[mailbox-extensions](mailbox-extensions.md).

## Other services

The client's namespaces are `analytics`, `apiKeys`, `attachments`, `campaigns`,
`contactGroups`, `contacts`, `conversations`, `customFields`, `email` (the send
facade plus domains, senders, tracking, review, and blocks),
`extensionInstallations`, `extensions`, `mailboxes`, `media`, `messages`,
`namespaces`, `operations`, `organizations`, `scheduledMessages`, `templates`,
`unsubscribeGroups`, and `webhooks`. Each method is named for the API operation
it calls, so `samva.contacts.bulkImport` is documented at
`https://samva.dev/docs/api-reference/contacts/bulkImport`. All methods take
flat parameters, return decoded success values, and throw typed errors. The
Effect module for a namespace is its kebab-cased path, such as
`samva/effect/unsubscribe-groups`.

## REST equivalent

Every call maps to the REST API. To send without the SDK:

```bash
curl -X POST https://api.samva.dev/v1/messages \
  -H "X-API-Key: $SAMVA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": [{ "email": "ada@example.com" }],
    "channel": "email",
    "email": { "subject": "Welcome to Samva", "html": "<h1>Welcome!</h1>" }
  }'
```

See [auth](auth.md) for key types and error shapes.

## Recover from errors

Read the API `_tag` (CLI `reason`, MCP `error.tag`) and its message before choosing the next call.
Do not retry a rejected request unchanged. CLI `next` and MCP `hint` carry recovery guidance.

| Tag                                                            | Next action                                                                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`                                              | Fix each dotted path in `fields`, then retry.                                                                                                 |
| `UnauthorizedError`                                            | Supply an active bearer key; in the CLI run `samva login` or set `SAMVA_API_KEY`.                                                             |
| `ForbiddenError`                                               | Use a key with the required scope and follow the message.                                                                                     |
| `ResourceNotFoundError`                                        | Call the matching list operation to find a valid id.                                                                                          |
| `RateLimitedError`                                             | Wait `retryAfterSeconds` before retrying.                                                                                                     |
| `PaymentRequiredError`                                         | Check usage, the reset time, and the plan's limits in billing.                                                                                |
| `FlagDisabledError`                                            | Use an enabled feature for the organization.                                                                                                  |
| `OnboardingReviewRequiredError`                                | Follow `nextAction`; do not send again until review permits it.                                                                               |
| `ConflictError`                                                | Read the resource and resolve the conflict before retrying.                                                                                   |
| `InternalError`, `ExternalServiceError`, `GatewayTimeoutError` | Retry once, preserving a send's idempotency key; report a repeat failure with `feedback_send` or `samva feedback send`, naming the operation. |

Check `skippedRecipients` on send receipts before treating every requested address as accepted.
Each entry names the address and suppression reason; `group-unsubscribe` also names its
`unsubscribeGroupId`. An accepted send can wait: `waitReason: "content-review"` and
`reviewExpectedAt` describe the hold. Read the message to observe progress instead of
creating another send.

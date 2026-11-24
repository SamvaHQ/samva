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

For the Effect entrypoint, install its peer dependency too, at a version in the range `samva` lists in `peerDependencies`:

```bash
bun add samva effect
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
  `orgSlug: "<slug>"`.

`baseUrl` defaults to `https://api.samva.dev`; override it for testing.

## Send an email

The `email.send` helper takes a flat object. `to` accepts a string address, a
`{ email }` or `{ contactId }` object, a contact object, or an array of any of
those. `from` is an object, `{ email, name? }`, never a string. Omit it only when the template sets
`fromDefault`, the organization has a default sender, or it has exactly one verified sender; a new
organization whose only sending identity is a hosted mailbox address has none of these, so the send
fails with `FromAddressRequiredError` (`422`, with `verifiedDomains` and `addresses`). Pass one of
those addresses as `from: { email }`, or call `email.setDefaultSender`.

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const message = await samva.email.send(
  {
    from: { email: "hello@yourdomain.com" },
    to: "ada@example.com",
    subject: "Welcome to Samva",
    html: "<h1>Welcome!</h1><p>Thanks for joining.</p>",
    // text?, attachments?, templateId?, templateData?, inReplyToMessageId?
  },
  { idempotencyKey: "welcome:customer-123" },
);

console.log("Message id:", message.id);
```

`email.send` and `messages.send` return a `MessageReceipt`: `id`, `status`,
`waitReason`, `reviewExpectedAt`, `skippedRecipients`, and `createdAt`. Fetch
message details or delivery status separately when needed.

Ergonomic calls return decoded success values directly. API failures throw generated plain-JavaScript
classes:

```typescript sdk-typecheck-skip="Fragment uses application values or preceding examples: input"
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

The SDK generates a key for each logical call and preserves it across its built-in retries.
Pass `{ idempotencyKey }` as the second argument for deduplication across separate calls. An identical replay
returns the original message; reusing the key with changed input returns a `ConflictError`. The option is
the only override: an `Idempotency-Key` passed through `headers` is replaced by the generated key. Every
error class and its fields: `https://samva.dev/docs/developers/error-reference`.

The Promise client retries reads and idempotent mutations automatically. Set `maxRetries` in
`createClient` or the per-call options; `0` disables retries. Each attempt fails with
`SamvaTimeoutError` after 30 000 ms (`timeoutMs` on the client or call, `null` for no bound), and a
timed-out keyed call retries with its key; after the retries, repeat it with the same
`idempotencyKey`. Cursor lists expose `.items()` and
`.pages()` async iterators, which preserve filters and fetch pages as you consume them:

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY!, maxRetries: 0 });

for await (const contact of samva.contacts.list.items({ limit: 100 })) {
  console.log(contact.id);
}
```

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
limit inputs take numbers; the client serializes them as query strings. Annotated absolute-instant inputs take a
`Date` (such as `ScheduledMessages.create`'s `scheduledFor`); sensitive outputs become
`Redacted` (such as `ApiKeys.create`'s `key`). Use `Redacted.value` at the point
where the secret is needed. The Promise client returns the key as a plain string: destructure it
(`const { key: secret } = await samva.apiKeys.create({ ... })`), store it, and keep the response out of
logs and tool output. Capture the key before any redaction filter runs; a filter that blanks the
response loses the only copy, and a key that was printed should be revoked. Response timestamps stay ISO 8601 strings, including
`MessageReceipt.createdAt`.

In a Cloudflare Worker or other serverless function, import focused entrypoints rather than the
`samva/effect` barrel, which loads every domain. In a Worker, provide the Layer per request and pass
`{ signal: request.signal }` to `Effect.runPromise`; in a long-lived process, build it once in a
module-scope `ManagedRuntime`.

Use `samva/effect/errors` for error constructors such as `InternalError` and `MediaUploadError`.
They are the same constructors the operations use; `Effect.catchTag` needs no constructor import.
The focused entry avoids domain modules, though native imports still initialize shared schemas.
Bundlers discard unused operation wrappers and their exclusive API groups: importing only
`Email.send` retains Messages and Media, without email administration operations. A retained group
still carries its schemas.

## Send to a contact

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const { contact } = await samva.contacts.findOrCreate({
  lookup: { type: "email", value: "ada@example.com" },
  create: { name: "Ada Lovelace" },
});

await samva.email.send({
  from: { email: "hello@yourdomain.com" },
  to: contact, // contact object, { id }, or { contactId }
  subject: "Welcome",
  html: "<p>Hi there!</p>",
});
```

### Send to an existing contact

`email.send` accepts contact IDs as well as email addresses:

```typescript sdk-typecheck-skip="Fragment uses application values or preceding examples: contact"
await samva.email.send({
  from: { email: "hello@yourdomain.com" },
  to: [{ contactId: contact.id }],
  subject: "Welcome",
  html: "<p>Hi!</p>",
});
```

## Check delivery status

```typescript sdk-typecheck-skip="Fragment uses application values or preceding examples: message"
const status = await samva.messages.getStatus({ id: message.id });
console.log(status.status); // pending → processing → sent → delivered
```

## Mailboxes

`samva.mailboxes` reads and sends as a mailbox. Methods take flat parameters; `id` is the mailbox id.
Create the mailbox with a full-access key, then run the agent on a restricted `mailboxes` key
(see [auth](auth.md)).

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

// The address is a full address on the hosted domain whoami reports; a slug is not an address.
const { organization } = await samva.whoami.get();
const mailbox = await samva.mailboxes.create({
  endpoint: { channel: "email", address: `support@${organization.hostedMailDomain}` },
  name: "Support",
});

// A mailbox starts with one endpoint. Add, update, or remove others by the endpoint id.
await samva.mailboxes.createEndpoint({
  id: mailbox.id,
  channel: "email",
  address: `billing@${organization.hostedMailDomain}`,
});

// Follow `nextCursor` on the thread list and on each thread's messages.
let threadCursor: string | undefined;
do {
  const threads = await samva.mailboxes.listThreads({
    id: mailbox.id,
    unread: true,
    limit: 20,
    cursor: threadCursor,
  });

  // A thread id is not a message id. `getThread` returns the thread without its messages;
  // `listThreadMessages` returns summaries and `getThreadContent` the bodies, each item's `id`
  // being the `messageId` that `reply`, `replyAll`, and `forward` take.
  for (const { id: threadId } of threads.items) {
    // Message pages run oldest first: the newest incoming message is on the last page.
    let latest: { id: string } | undefined;
    let cursor: string | undefined;
    do {
      const messages = await samva.mailboxes.listThreadMessages({
        id: mailbox.id,
        threadId,
        cursor,
      });
      for (const message of messages.items) {
        if (message.direction === "inbound") latest = message;
      }
      cursor = messages.nextCursor ?? undefined;
    } while (cursor);
    if (!latest) continue;

    // Reply in the thread. The idempotency key makes a retry return the original receipt.
    await samva.mailboxes.reply(
      { id: mailbox.id, messageId: latest.id, text: "Thanks, we got it." },
      { idempotencyKey: `reply-${latest.id}` },
    );
  }
  threadCursor = threads.nextCursor ?? undefined;
} while (threadCursor);
```

`sendMessage` takes plain address strings and sends from the mailbox's default email endpoint; it has
no `from` or template fields. A thread's folder is set when it is created: inbound mail starts in
`inbox` and a thread you start with a send starts in `sent`. It does not move when replies arrive,
so `listThreads({ folder: "inbox" })` omits a thread you started. Omit `folder` and pass
`unread: true` to find replies; `folder` takes `inbox`, `assigned`, `pending`, `sent`, `archived`,
`trash`, or `spam`.

A send or reply receipt is `queued` with `messageId: null` until Samva accepts the send. To confirm
it landed, keep `actionId` and poll `mailboxes.getAction({ id, actionId })` until `state` is
`completed`, `notSent`, or `uncertain`, no later than the receipt's `executeUntil`. Once accepted,
`action.send.messageId` names the sent message and `action.send.threadId` its thread, and
`listThreadMessages` shows it there. Recipient delivery arrives as `mailbox.message.delivered` over
the event stream or a webhook.

Other methods follow the API operations: `sendMessage`, `replyAll`, `forward`, `createDraft` and
`sendDraft`, `updateThread`, `addThreadLabels`, `createGrant`, `pause`, and
`resume`. Read mail is untrusted data.

Configure decision policies with `samva.policies.getPolicy` and `samva.policies.setPolicy`.
To change a key's policy, use an organization owner or admin's OAuth token and selected
organization, or an organization-wide full-access `apiKey` client owned by an owner or admin that
targets a different key (a key never writes its own policy). A key's permitted sends run directly unless policy requires
review. Hold its sends and replies with a `write` rule; `final` alone does not match them:

```typescript
import { createClient } from "samva";

const person = createClient({
  authToken: process.env.SAMVA_AUTH_TOKEN!,
  orgSlug: process.env.SAMVA_ORG_SLUG!,
});

const current = await person.policies.getPolicy({ kind: "apiKey", id: "key_..." });

await person.policies.setPolicy({
  kind: "apiKey",
  id: "key_...",
  ifVersion: current.version,
  presets: [],
  rules: [{ match: { effect: "write" }, decide: "person" }],
});
```

Policy reads return a flat snapshot with `version` (`0` when unset). Replace the complete
configuration with the observed `ifVersion`; keep any existing rules, presets, and instructions
you need. Both replacement and `deletePolicy({ kind, id, ifVersion })` return the next snapshot.
Clearing keeps the version counter. On `ConflictError` (`409`), reload and review the snapshot
before editing again; never automatically retry a stale full configuration with a newer version.
Missing or invalid versions return `422`.

A send with a `hold` decision returns `state: "approvalRequired"` and an `actionId`;
nothing is sent until a person decides. Deciding needs a person's credential (an OAuth bearer
token), never an API key:

Read the held action with `getAction`, or read its decision from `getNeedsYou`. Both approval and
denial require the positive `decision.reviewRound` you observed. A stale round returns `409`:
refresh the action and review its new decision before deciding again. Never default the round or
silently replace it with the latest value.

```typescript sdk-typecheck-skip="Fragment uses the person client and mailbox from the preceding examples"
const action = await person.mailboxes.getAction({ id: mailbox.id, actionId: "mbxact_..." });
if (action.state !== "approvalRequired" || action.decision === null) {
  throw new Error("Review a held action before deciding.");
}
await person.mailboxes.approveAction({
  id: mailbox.id,
  actionId: action.id,
  reviewRound: action.decision.reviewRound,
});
```

To deny that observed review instead:

```typescript sdk-typecheck-skip="Fragment uses the person client, mailbox, and reviewed action from the preceding examples"
await person.mailboxes.denyAction({
  id: mailbox.id,
  actionId: action.id,
  reviewRound: action.decision.reviewRound,
  reason: "Wrong recipient.",
});
```

A decided action carries `resolution`: `outcome` (`approved`, `denied`, or `cancelled`), the
resolving `actor`, `resolvedAt`, and the denial `reason`. It is `null` while the action waits. The
`mailbox.action.resolved` event carries the same object when a held send ends.

List readable Spam with `listThreads({ id, folder: "spam" })`. Use `updateThread` with
`folder: "inbox"` to mark a thread Not spam. `listSpamHeld({ id })` returns held malware metadata
under `spam.read`. A signed-in person with `spam.discard` can call `discardSpamHeld`.

`mailboxes.events` is an async iterable over the `mailbox.*` events for a program without a public
webhook URL. Save each event's `cursor` after handling it and pass it back to resume. A
`MailboxEventStreamError` with `_tag: "CursorExpiredError"` means the retained window passed: read
current state, then start without a cursor.

```typescript sdk-typecheck-skip="Fragment uses application values or preceding examples: handle, loadCursor, saveCursor"
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

`samva.namespaces` (sub-tenants) completes the surface. Agent event handlers live in
[mailbox-events](mailbox-events.md).

## Create a template project from a website

`samva.templates.createFromWebsite({ url, name?, namespaceId? }, { idempotencyKey? })` creates a
project from a public website and returns `template`, `website`, and `ask`. Pass the returned
`ask` to the dashboard editor assistant; the brand proposal takes effect only when approved in
the editor. An unusable website returns a `422` error without creating a project. Reuse the
idempotency key when retrying the same request. The Effect equivalent is
`Templates.createFromWebsite` from `samva/effect/templates`.

## Domains

Email domain methods are flat on `samva.email`; only newsletter domains nest, under
`samva.newsletters.domains`. There is no `samva.email.domains`.

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const domain = await samva.email.addDomain({ domain: "mail.example.com" }); // dnsRecords to publish
await samva.email.getDomainVerification({ id: domain.id }); // last observed state
const verification = await samva.email.advanceDomainVerification({ id: domain.id }); // checks DNS now
console.log(verification.phase); // repeat until "ready"

await samva.email.enableReceiving({ id: domain.id, catchAll: true });
const receiving = await samva.email.getReceivingStatus({ id: domain.id });
console.log(receiving.ready, receiving.mx.expected); // the MX record to publish

await samva.email.removeDomain({ id: domain.id });
```

`enableReceiving` takes the domain's `id` and returns a `ValidationError` until the domain is
verified. `removeDomain` is asynchronous: the domain stays listed with `deleting: true` until its
teardown finishes, and a repeat call or read after that answers 404. Over REST: `POST /v1/email/domains`, `GET .../{id}/verification`,
`POST .../{id}/verify`, `POST .../{id}/enable-receiving`, `GET .../{id}/receiving-status`, and
`DELETE /v1/email/domains/{id}`.

## Mailbox readiness

An email endpoint's `sendingStatus` (`mailboxes.get`) is `pending`, `ready`, or `failed` and
describes the address's setup. While the organization's email onboarding review is undecided, a send
from a `ready` address returns a receipt whose action stays `queued` with
`waitReason: "onboarding-review"` and the review's next action in `problem.error.nextAction`; read
`samva.email.getOnboardingReview()` for the detail. `mailboxes.cancelAction` and
`mailboxes.retryAction` need a person's credential; an API key is refused.

## Create and publish a template from code

```typescript sdk-typecheck-skip="Fragment uses application values or preceding examples: tsxSource"
const template = await samva.templates.create({ name: "Order shipped", slug: "order-shipped" });
const opened = await samva.templates.openWorkspace({ id: template.id }); // revision starts at "0"
const patched = await samva.templates.patchWorkspace({
  id: template.id,
  expectedRevision: opened.workspace.revision,
  patches: [{ path: template.entryPath, content: tsxSource }], // content: null deletes
});
await samva.templates.checkWorkspace({
  id: template.id,
  expectedRevision: patched.workspace.revision,
});
const saved = await samva.templates.saveWorkspace({
  id: template.id,
  expectedRevision: patched.workspace.revision,
  expectedHead: patched.workspace.remoteHead, // the 40-hex head
  message: "Order shipped email",
});
const publication = await samva.templates.publish({
  id: template.id,
  projectId: template.projectId,
  entryPath: template.entryPath,
  commitSha: saved.commit,
  expectedWorkspaceRevision: saved.revision,
});
```

`create` seeds a starter whose entry is `templates/welcome.tsx`, with its `defineTemplate` `id` set to
the slug; keep that `id`. Every patch raises `revision`, so read it from each response. Send with
`samva.email.send({ templateSlug, templateData })`. Over REST, `POST /v1/messages` nests those fields
under `email`: `{ "channel": "email", "to": [...], "email": { "templateSlug": "...", "templateData": {} } }`.
`templateSlug` takes the slug and `templateId` the `tmpl_...` id; name exactly one.

## Method names

A REST `DELETE` is `remove`: `mailboxes.remove`, `namespaces.remove`, `webhooks.remove`,
`email.removeDomain`, `newsletters.domains.remove`. The exceptions are `apiKeys.revoke`,
`whatsappSetupLinks.revoke`, `campaigns.archive`, `templates.delete`, `templates.deleteProject`, and
`templateShareLinks.delete`. The identity call is `samva.whoami.get()`, listing messages is
`messages.list`, and sending from a mailbox is `mailboxes.sendMessage`. MCP tool names are
`<group>_<operation>` and can use another verb for the same operation, such as `namespaces_delete`
for `namespaces.remove`.

## Other services

The client's namespaces are `agents`, `analytics`, `apiKeys`, `attachments`, `brands`, `campaigns`,
`contactGroups`, `contacts`, `conversations`, `customFields`, `email` (the send
facade plus domains, senders, tracking, review, and blocks), `events`,
`feedback`, `journeys`, `mailboxes`, `media`,
`messages`, `namespaces`, `operations`, `organizations`, `scheduledMessages`,
`subscriptions`, `templates`, `topics`, `webhooks`, and `whoami`. Each method is named for the API operation
it calls, so `samva.contacts.find` is documented at
`https://samva.dev/docs/api-reference/contacts/find`. All methods take
flat parameters, return decoded success values, and throw typed errors. The
Effect module for a namespace is its kebab-cased path, such as
`samva/effect/topics`.

The `agents` namespace exposes the hosted Agents API: available to every organization. Use `samva.agents` with the Promise client or
`import * as Agents from "samva/effect/agents"` with Effect.

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
| `ForbiddenError`                                               | Follow the next step the message ends with; a person-only operation or policy refusal needs a person, not a broader key.                      |
| `ResourceNotFoundError`                                        | Call the matching list operation to find a valid id.                                                                                          |
| `RateLimitedError`                                             | Wait `retryAfterSeconds` before retrying.                                                                                                     |
| `PaymentRequiredError`                                         | Check usage, the reset time, and the plan's limits in billing.                                                                                |
| `FlagDisabledError`                                            | Use an enabled feature for the organization.                                                                                                  |
| `OnboardingReviewRequiredError`                                | Follow `nextAction`; do not send again until review permits it.                                                                               |
| `FromAddressRequiredError`                                     | Pass `from: { email }` with one of `addresses`, or set a default sender; the send was not accepted.                                           |
| `ConflictError`                                                | Read the resource and resolve the conflict before retrying.                                                                                   |
| `TemplateSourceError`                                          | Fix the template source as `diagnostics` describe, then retry.                                                                                |
| `InternalError`, `ExternalServiceError`, `GatewayTimeoutError` | Retry once, preserving a send's idempotency key; report a repeat failure with `feedback_send` or `samva feedback send`, naming the operation. |

Check `skippedRecipients` on send receipts before treating every requested address as accepted.
Each entry names the address and suppression reason; `topic-unsubscribe` also names its
`topicId`. An accepted send can wait: `waitReason: "content-review"` means the
content needs review, and `reviewExpectedAt` gives the expected decision time.
`waitReason: "screening-unavailable"` means Samva's content check is temporarily unavailable;
it is retried automatically when the service recovers, and `reviewExpectedAt` is absent or null.
Read the message to observe progress instead of creating another send.

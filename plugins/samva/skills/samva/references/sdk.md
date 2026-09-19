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
bun add samva effect
```

## Promise client

```typescript
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });
```

The root entrypoint and `samva/promises` expose the same Promise client.

`createClient` takes exactly one auth mode:

- `{ apiKey }` — an API key (starts with `samva_sk_live_` or `samva_sk_test_`). The organization is
  derived from the key; sent as the `X-API-Key` header.
- `{ authToken }` — an OAuth bearer token (e.g. minted by `samva login`). Sent
  as `Authorization: Bearer …`; the org is resolved per request, so pass the
  active org with `headers: { "x-org-slug": "<slug>" }`.

`baseUrl` defaults to `https://api.samva.dev`; override it for local
development.

## Send an email

The `email.send` helper takes a flat object. `to` accepts a string address, a
`{ email }` or `{ contactId }` object, a contact object, or an array of any of
those.

```typescript
const message = await samva.email.send({
  to: "ada@example.com",
  subject: "Welcome to Samva",
  html: "<h1>Welcome!</h1><p>Thanks for joining.</p>",
  idempotencyKey: "welcome:customer-123",
  // text?, attachments?, templateId?, templateData?, inReplyToMessageId?
});

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

Keep one stable `idempotencyKey` with each retryable logical send. An identical replay returns the
original message; reusing the key with changed input returns a conflict.

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

## Other services

The client also exposes `domains` and `senders` (under `email`), `webhooks`,
`contacts`, `conversations`, `apiKeys`, `organizations`, `scheduledMessages`
(`create`, `list`, `get`, `cancel`), `campaigns` (`create`, `list`, `get`,
`update`, `archive`, plus `scheduleRun`, `listRuns`, `getRun`, `pauseRun`,
`resumeRun`, `cancelRun`, `listRecipients`). All methods take flat parameters,
return decoded success values, and throw typed errors.

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

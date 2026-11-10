## @samva/better-auth@0.12.0

### Require Samva SDK 0.41

Both adapters now require `samva@^0.41.0` and validate against SDK 0.41.0.
Only the current SDK minor is supported; upgrade Samva alongside the adapter.

The adapter surface is unchanged. `@samva/email-sdk` still calls `email.send` with
a flat email payload and reads `id`; `@samva/better-auth` still calls
`messages.send` with `{ to, channel: "email", email }`. The email payload and both
send responses keep the same shape in 0.41. What changed around them:

- Samva refuses quoted and non-ASCII local parts. Send bare addresses with ASCII
  dot-atom local parts; Unicode domains are converted to punycode.
- Topic IDs start with `tpc_` instead of `unsub_`, and requests that pass an
  `unsub_` ID are rejected. Replace the prefix wherever you store a topic ID.
- Suppression entries carry `namespaceId`. A namespace credential lists, counts,
  and removes only its own entries.

### Require Samva SDK 0.35

Both adapters now require `samva@^0.35.0` and validate against SDK 0.35.0.
Only the current SDK minor is supported; upgrade Samva alongside the adapter.

### Require Samva SDK 0.37

Both adapters now require `samva@^0.37.0` and validate against SDK 0.37.0.
Only the current SDK minor is supported; upgrade Samva alongside the adapter.

The adapter surface is unchanged. `@samva/email-sdk` builds a flat email payload,
calls `email.send`, and reads `id` from the response. `@samva/better-auth` builds
`{ to, channel: "email", email }`, calls `messages.send`, and ignores the
response. Both contracts survived 0.36 and 0.37. What changed around them:

- Mailbox keys and extension installations carry decision policies instead of
  `sendMode`. A held send returns `approvalRequired` with a `decision`; a person
  approves with that decision's `reviewRound`, and a stale round returns 409.
  Replacing a policy requires the version you read as `ifVersion`.
- `samva` 0.37 removes the RSA `v2` helpers from the webhooks package.
  Verify a delivery with `verify` or `verifyRequest` from `samva/webhooks` and
  the endpoint signing secret.
- Template responses and create/update payloads no longer expose `isActive`.
  `templates.delete` and `templates.deleteProject` delete permanently and refuse
  a referenced template with `TemplateInUseError` (409).
- Scheduled sends, analytics, and conversations accept `namespaceId`, and an
  agent's knowledge sources must belong to its namespace.

## @samva/better-auth@0.11.0

### Require Samva SDK 0.33

Upgrade `samva` to `^0.33.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests now use `0.33.0`.

Both adapters pick up the default-on retry the SDK gained in 0.30: reads and
idempotent mutations are retried up to four attempts, and an explicit
`{ idempotencyKey }` in the second argument is the only way to pin a key across
calls.

### Require Samva SDK 0.34

Upgrade `samva` to `^0.34.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests now use `0.34.0`.

0.34 adds a `kind: "replay"` webhook delivery attempt with
`classification: "skipped"` and a `queueMessageId` for replays of terminal
deliveries. Those receipts make no HTTP request and do not advance the
automatic retry lifecycle, so attempt counts that assume every entry is a
request need to filter on `kind` first.

## @samva/better-auth@0.10.0

### Require Samva SDK 0.27

Upgrade `samva` to `^0.27.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests use `0.27.0`.

## @samva/better-auth@0.9.0

### Require Samva SDK 0.25

Upgrade `samva` to `^0.25.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests use `0.25.0`.

## @samva/better-auth@0.8.0

### Require Samva 0.23

The adapters now require `samva@^0.23.0`, with development and tests pinned to `0.23.0`.
Only the current SDK minor is supported while Samva is 0.x; update Samva alongside the adapter.

## @samva/better-auth@0.7.0

### Require Samva 0.22

The adapters now require `samva@^0.22.0`, with development and tests pinned to `0.22.0`.
Only the current SDK minor is supported while Samva is 0.x; update Samva alongside the adapter.

## @samva/better-auth@0.6.0

### Require Samva 0.20

The integrations require `samva@^0.20.0`. Only the current Samva SDK minor is supported while Samva is 0.x.

## @samva/better-auth@0.5.0

### Require Samva 0.18

The integrations require `samva@^0.18.0`. Only the current Samva SDK minor is supported while Samva is 0.x.

## @samva/better-auth@0.4.0

### Require Samva 0.15

The integrations require `samva` 0.15 for their SDK dependency.

## @samva/better-auth@0.3.0

### Target the Samva 0.11 SDK

Both packages now require `samva@^0.11.0`. Upgrade `samva` alongside them; the send calls they make
are unchanged.

`@samva/email-sdk` reports a `DeliveryUnavailableError` (Samva could not hand the send to delivery)
as `delivery: "not_sent"`, so Email SDK can retry it with the same idempotency key.

## @samva/better-auth@0.2.0

### Target the Samva 0.5 SDK

Both packages now target `samva@^0.5.0`. `@samva/better-auth` also moves its
Better Auth peer to `1.7.2` and requires Node 22 or newer, matching the SDK.

`@samva/email-sdk` declares native idempotency support: an `idempotencyKey` from
Email SDK is forwarded as Samva's `Idempotency-Key` header, onboarding-review
refusals report `delivery: "not_sent"`, and a `409 ConflictError` is reported as
non-retryable.

## @samva/better-auth@0.1.1

### Support Samva 0.3

Expand the Samva peer dependency to support the current public email SDK.

## @samva/better-auth@0.1.0

### Initial Better Auth integration

Publish the first public release of the Better Auth integration for sending authentication emails through Samva.

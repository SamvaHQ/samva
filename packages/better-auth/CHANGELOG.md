## @samva/better-auth@0.10.0

### Require Samva SDK 0.26

Upgrade `samva` to `^0.26.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests use `0.26.0`.

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

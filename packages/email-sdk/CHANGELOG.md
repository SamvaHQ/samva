## @samva/email-sdk@0.7.0

### Require Samva 0.20

The integrations require `samva@^0.20.0`. Only the current Samva SDK minor is supported while Samva is 0.x.

## @samva/email-sdk@0.6.0

### Require Samva 0.18

The integrations require `samva@^0.18.0`. Only the current Samva SDK minor is supported while Samva is 0.x.

## @samva/email-sdk@0.5.0

### Require Samva 0.15

The integrations require `samva` 0.15 for their SDK dependency.

## @samva/email-sdk@0.4.0

### Preserve safe fallback for sender readiness

Classify `SenderNotReadyError` as `delivery: "not_sent"` so Email SDK can safely fall back to another provider when a Samva sending identity is still getting ready.

Require the Samva SDK 0.13 series so consumers can receive the typed sender-readiness error.

## @samva/email-sdk@0.3.0

### Target the Samva 0.11 SDK

Both packages now require `samva@^0.11.0`. Upgrade `samva` alongside them; the send calls they make
are unchanged.

`@samva/email-sdk` reports a `DeliveryUnavailableError` (Samva could not hand the send to delivery)
as `delivery: "not_sent"`, so Email SDK can retry it with the same idempotency key.

## @samva/email-sdk@0.2.0

### Target the Samva 0.5 SDK

Both packages now target `samva@^0.5.0`. `@samva/better-auth` also moves its
Better Auth peer to `1.7.2` and requires Node 22 or newer, matching the SDK.

`@samva/email-sdk` declares native idempotency support: an `idempotencyKey` from
Email SDK is forwarded as Samva's `Idempotency-Key` header, onboarding-review
refusals report `delivery: "not_sent"`, and a `409 ConflictError` is reported as
non-retryable.

## @samva/email-sdk@0.1.1

### Support Samva 0.3

Expand the Samva peer dependency to support the current public email SDK.

## @samva/email-sdk@0.1.0

### Initial Email SDK adapter

Publish the first public release of the Samva community adapter for Email SDK.

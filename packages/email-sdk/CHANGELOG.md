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

---
packages:
  "@samva/better-auth": minor
  "@samva/email-sdk": minor
---

## Target the Samva 0.11 SDK

Both packages now require `samva@^0.11.0`. Upgrade `samva` alongside them; the send calls they make
are unchanged.

`@samva/email-sdk` reports a `DeliveryUnavailableError` (Samva could not hand the send to delivery)
as `delivery: "not_sent"`, so Email SDK can retry it with the same idempotency key.

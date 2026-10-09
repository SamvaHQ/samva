---
packages:
  "@samva/better-auth": minor
  "@samva/email-sdk": minor
---

## Target the Samva 0.8 SDK

Both packages now target `samva@^0.8.0`.

`@samva/email-sdk` reports a `DeliveryUnavailableError` (Samva could not hand the send to delivery)
as `delivery: "not_sent"`, so Email SDK can retry it with the same idempotency key.

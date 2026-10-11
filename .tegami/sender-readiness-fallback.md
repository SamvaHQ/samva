---
packages:
  "group:email-sdk": minor
---

## Preserve safe fallback for sender readiness

Classify `SenderNotReadyError` as `delivery: "not_sent"` so Email SDK can safely fall back to another provider when a Samva sending identity is still getting ready.

Require the Samva SDK 0.13 series so consumers can receive the typed sender-readiness error.

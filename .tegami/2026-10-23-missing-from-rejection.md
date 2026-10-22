---
packages:
  "@samva/email-sdk": patch
---

## Treat a missing sender as a known rejection

`FromAddressRequiredError` now reports `delivery: "not_sent"` and
`retryable: false`, so Email SDK can apply its configured fallback policy.
The adapter keeps the request ID without retaining verified domain details.

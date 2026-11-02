---
packages:
  "@samva/better-auth": minor
  "@samva/email-sdk": minor
---

## Require Samva SDK 0.33

Upgrade `samva` to `^0.33.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests now use `0.33.0`.

Both adapters pick up the default-on retry the SDK gained in 0.30: reads and
idempotent mutations are retried up to four attempts, and an explicit
`{ idempotencyKey }` in the second argument is the only way to pin a key across
calls.

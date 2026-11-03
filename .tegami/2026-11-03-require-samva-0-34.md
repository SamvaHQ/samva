---
packages:
  "@samva/better-auth": minor
  "@samva/email-sdk": minor
---

## Require Samva SDK 0.34

Upgrade `samva` to `^0.34.0` alongside either adapter. Only the current 0.x SDK
minor is supported; adapter development and tests now use `0.34.0`.

0.34 adds a `kind: "replay"` webhook delivery attempt with
`classification: "skipped"` and a `queueMessageId` for replays of terminal
deliveries. Those receipts make no HTTP request and do not advance the
automatic retry lifecycle, so attempt counts that assume every entry is a
request need to filter on `kind` first.

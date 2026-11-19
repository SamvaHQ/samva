---
packages:
  "@samva/chat-adapter": minor
---

## Pass credentials as functions

`apiKey` and `webhookSecret` accept a function as well as a string. The adapter calls `apiKey` before every API request and `webhookSecret` for every delivery, without caching either, so rotated or short-lived credentials apply immediately. If a resolver fails or returns an empty value, the webhook handler throws so the delivery is retried, rather than answering `401`.

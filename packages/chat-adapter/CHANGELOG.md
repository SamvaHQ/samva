## @samva/chat-adapter@0.2.0

### Pass credentials as functions

`apiKey` and `webhookSecret` accept a function as well as a string. The adapter calls `apiKey` before every API request and `webhookSecret` for every delivery, without caching either, so rotated or short-lived credentials apply immediately. If a resolver fails or returns an empty value, the webhook handler throws so the delivery is retried, rather than answering `401`.

## @samva/chat-adapter@0.1.2

### Require samva 0.48

The packages now declare `samva@^0.48.0` as a peer, and the Chat SDK adapter and Eve extension depend on `@samva/webhooks@^0.48.0`. Install them alongside `samva@0.48`.

## @samva/chat-adapter@0.1.1

### Read the full body of long emails

Webhook payloads cap `message.text` at 32,000 characters. The Chat SDK adapter and the Eve channel now fetch the full message from the mailbox when a body reaches that length, so long emails reach the agent uncut. Shorter messages need no extra request.

## @samva/chat-adapter@0.1.0

### Connect mailbox agents to AI SDK, Chat SDK, and Eve

Use inbound-bound AI SDK tools, a Chat SDK adapter for signed email and WhatsApp webhooks, or an Eve extension that bundles both.

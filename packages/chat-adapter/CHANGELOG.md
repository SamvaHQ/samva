## @samva/chat-adapter@0.1.2

### Require samva 0.48

The packages now declare `samva@^0.48.0` as a peer, and the Chat SDK adapter and Eve extension depend on `@samva/webhooks@^0.48.0`. Install them alongside `samva@0.48`.

## @samva/chat-adapter@0.1.1

### Read the full body of long emails

Webhook payloads cap `message.text` at 32,000 characters. The Chat SDK adapter and the Eve channel now fetch the full message from the mailbox when a body reaches that length, so long emails reach the agent uncut. Shorter messages need no extra request.

## @samva/chat-adapter@0.1.0

### Connect mailbox agents to AI SDK, Chat SDK, and Eve

Use inbound-bound AI SDK tools, a Chat SDK adapter for signed email and WhatsApp webhooks, or an Eve extension that bundles both.

## @samva/chat-adapter@0.2.1

### Point npm at each package's docs

Each package's npm `homepage` now links to its guide on samva.dev, and its keywords name the frameworks it works with. The READMEs show the Samva mark and npm badges, the AI SDK example uses `isStepCount`, and the Chat SDK adapter README follows the standard Chat SDK sections: installation, usage, environment variables, configuration, platform setup, features, and license.

### Send a new conversation once per delivery

A post to an `openDM` conversation from inside a webhook handler now carries an idempotency key built from the delivery and the post's position, as replies already did. When Samva redelivers a webhook after a lost response, the handler's new-conversation posts return the saved receipt instead of sending again. Posts outside a webhook handler are unchanged.

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

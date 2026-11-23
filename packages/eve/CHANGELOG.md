## @samva/eve@0.1.5

### Requires `samva@^0.50.0`

Every Samva integration package now supports `samva@^0.50.0` and no longer accepts 0.48. Install it next to the package:

```sh
npm install samva@^0.50.0
```

If you call the SDK yourself beside these packages, read the `samva` 0.49 and 0.50 release notes. Spam replaces quarantine, inbound attachment downloads need a passing malware scan, and mailbox history import now uploads in parts.

## @samva/eve@0.1.4

### Point npm at each package's docs

Each package's npm `homepage` now links to its guide on samva.dev, and its keywords name the frameworks it works with. The READMEs show the Samva mark and npm badges, the AI SDK example uses `isStepCount`, and the Chat SDK adapter README follows the standard Chat SDK sections: installation, usage, environment variables, configuration, platform setup, features, and license.

## @samva/eve@0.1.2

### Require samva 0.48

The packages now declare `samva@^0.48.0` as a peer, and the Chat SDK adapter and Eve extension depend on `@samva/webhooks@^0.48.0`. Install them alongside `samva@0.48`.

## @samva/eve@0.1.1

### Read the full body of long emails

Webhook payloads cap `message.text` at 32,000 characters. The Chat SDK adapter and the Eve channel now fetch the full message from the mailbox when a body reaches that length, so long emails reach the agent uncut. Shorter messages need no extra request.

## @samva/eve@0.1.0

### Connect mailbox agents to AI SDK, Chat SDK, and Eve

Use inbound-bound AI SDK tools, a Chat SDK adapter for signed email and WhatsApp webhooks, or an Eve extension that bundles both.

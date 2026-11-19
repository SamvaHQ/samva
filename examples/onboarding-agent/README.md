# WhatsApp onboarding agent

A code-first Samva agent declaration that uses the conversation host's `request_connection` and
`merge_verified_contact` tools, and a contact-scoped Samva MCP integration. It creates a starter
template and updates brand fields in the connected owner's account. It does not restyle or publish
an email.

`instructions.md` sets the conversation's rules, and `skills/onboarding.md` walks the agent through
each step: connect, link the verified account, draft the starter and brand, propose the domain and
sender, and follow up on lifecycle events.

## Install and check

```sh
bun install
bun run typecheck
bun run eval
bun run build
bun run info
```

The example uses `samva@^0.48.0` for `samva/agent`, `samva/agent/test`, and
`contacts.mergeByConnection({ id, connection })`. It uses `@samva/cli@^0.41.0` for
`samva agents build` and `samva agents info`.

Offline evals exercise declaration loading for lifecycle turns, contact scope, bounded tool grants,
and owner approval floors. They do not run a model, authenticate a person, merge contacts, or send
WhatsApp messages.

## Configure

Replace every identifier in `configuration.ts` with your installation's values:

| Field              | Meaning                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `integrationId`    | Installed Samva MCP integration supporting per-contact OIDC with `openid email` |
| `endpointIds`      | Mailbox WhatsApp endpoints this agent answers                                   |
| `followUpTemplate` | Approved WhatsApp follow-up template for closed service windows                 |

Configure Samva's platform lifecycle organization so owner lifecycle events resolve into that
organization's contacts. The manifest subscribes to `contact.connection_completed`, `domain.updated` and `review.updated`.
Connection authorization and verified binding use the built-ins; no module tool accepts an email
address or a connection account ID as identity proof.

## Approval and delivery

The selected integration tools reach the contact's own connected account. The integration catalog qualifies names as `samva.<MCP tool name>`, which is what the manifest
grant and tool policy match. Domain and sender creation have explicit `person` policy floors, in addition to the host's integration policy and
approval rules. Approval belongs on the owner's approval page; it is not an agent tool.

The instructions distinguish a starter from a completed design, link the account only after the
connection completes, and pick up across event turns. Outside the 24-hour WhatsApp window the host
sends the configured follow-up template in place of the reply. Setup links, portal links, verification codes, and webhook secrets stay out of chat. WhatsApp
setup belongs in the dashboard.

## Publish

Create the hosted agent once, then publish this module as its next version:

```sh
samva agents create "WhatsApp onboarding" --json
samva agents publish <agent-id> --dir . --entry agent.ts --dry-run
samva agents publish <agent-id> --dir . --entry agent.ts
```

`--dry-run` builds and validates locally without calling the API. The manifest's `endpointIds`
decide which WhatsApp endpoints the published version answers.

See the [cookbook](../../cookbooks/onboarding-agent.md) for the conversation and host boundaries.

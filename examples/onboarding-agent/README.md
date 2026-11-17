# WhatsApp onboarding agent

A code-first Samva agent declaration that uses the conversation host's `request_connection` and
`merge_verified_contact` tools, and a contact-scoped Samva MCP integration. It creates a starter
template and updates brand fields in the connected owner's account. It does not restyle or publish
an email.

The instruction and skill files contain `TODO(lead)` placeholders. Replace them before publishing;
the declaration alone does not implement the onboarding conversation.

## Install and check

```sh
bun install
bun run typecheck
bun run eval
bun run build
bun run info
```

The example requires the SDK release containing `samva/agent`, `samva/agent/test`, and the flat
`contacts.mergeByConnection({ id, connection })` contract. Published `samva@0.46.1` lacks the agent
exports. Until that release, build the SDK from Samva main and use an uncommitted local link:

```sh
# In the Samva application checkout:
cd ~/Developer/samva/packages/sdk
bun run build
bun link
# In this example:
bun link samva
```

Use the application checkout's CLI for `samva agents build` and `samva agents info` if the installed
CLI lacks those commands. The committed dependency remains a registry range, never a local path.

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
organization's contacts. The manifest subscribes to `domain.updated` and `review.updated`.
Connection authorization and verified binding use the built-ins; no module tool accepts an email
address or a connection account ID as identity proof.

## Approval and delivery

The selected integration tools reach the contact's own connected account. Domain and sender
creation have explicit `person` policy floors, in addition to the host's integration policy and
approval rules. Approval belongs on the owner's approval page; it is not an agent tool.

The lead's instructions must distinguish a starter from a completed design, verify the connection
before binding, preserve intent across event turns, and handle the 24-hour WhatsApp window.
Setup links, portal links, verification codes, and webhook secrets stay out of chat. WhatsApp
setup belongs in the dashboard.

See the [cookbook](../../cookbooks/onboarding-agent.md) for the conversation and host boundaries.

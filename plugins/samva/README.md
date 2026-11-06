# Samva agent plugin

Connect a coding agent to Samva's organization-scoped email tools at
`https://mcp.samva.dev`. The bundle also includes Samva's canonical agent skill
for choosing between the hosted MCP server, TypeScript SDKs, REST API, CLI,
dashboard, and TSX template editor.

This package is the Codex and Cursor distribution. Samva's published ChatGPT
plugin is a separate listing with its own version and bundled skill snapshot;
see [Samva in ChatGPT](./docs/chatgpt.md).

## Authentication

The MCP configurations contain no secrets. On first use, an OAuth-capable
client follows Samva's protected-resource discovery and asks the user to
authenticate. Cursor's configuration names Samva's pre-registered public OAuth
client because Cursor does not currently consume Client ID Metadata Documents;
the client ID is a public identifier and the flow still requires PKCE. API-key
clients may configure `SAMVA_API_KEY` or an `X-API-Key` header in their own
private client settings; never add a key to this repository.

The hosted server performs live organization-scoped reads and writes. Confirm
each requested mutation deliberately, use a stable idempotency key for
retryable sends, and follow the revision-safe workflow for template edits.

## Included surfaces

| Client       | Manifest                     | MCP configuration |
| ------------ | ---------------------------- | ----------------- |
| OpenAI Codex | `.codex-plugin/plugin.json`  | `.mcp.json`       |
| Cursor       | `.cursor-plugin/plugin.json` | `mcp.json`        |

Both manifests load `skills/samva/SKILL.md` and its seven references. See
[`provenance.json`](./provenance.json) for the pinned source commit, public
skill archive, version, and digests of the skill snapshot in this package.

## Public documentation

The [`docs`](./docs) directory explains Codex and Cursor package loading, the
published ChatGPT plugin, direct Claude MCP connection, authentication and
permission boundaries, and synthetic verification examples. Run
`bun run validate:agent-plugin` from the repository root for the automated
packaging checks.

## SDK and CLI compatibility

Use `samva@^0.36.0` and `@samva/cli@^0.31.0` with this repository's guidance.
Samva is the email and WhatsApp API; the mailbox and transactional examples here
use email explicitly. Shared template and message reads can return channels other
than email, so inspect the channel before using email content.

Request bodies, including nested objects and CLI JSON input, must contain only
fields declared by the operation. Build mutation input explicitly rather than
spreading a read response; webhook updates use `eventTypes`, not `events`.
Omit absent optional query and header parameters instead of passing `null`.
Nullable body fields remain valid: `email.updateCatchAllConfig` accepts
`endpointId: null` to clear the webhook while keeping receiving enabled.

CLI template list/get commands read every channel. Webhook endpoint stats expose
`latestAttempt` (which can be null). Hosted agent create/replace-draft definitions
require `reasoning` (`auto` preserves the default); `model` can be an alias or a
catalog id, and `knowledgeSourceIds` is optional. Agent reads report owner/credit
pauses and spend-cap state. The mailbox-agent example runs its own event loop;
it does not create or replace hosted agents.

Mailbox sends and replies use scoped decision rules. Set a `write` minimum of `person` for
reviewed keys or extension installations; `sendMode` and `--send-mode` are not accepted. Policy
writes and approvals use a person's OAuth session. Approval and denial carry the observed
`decision.reviewRound`, and CLI decisions require `--review-round`. A stale round returns `409`.

The bundled skill is the immutable snapshot identified in `provenance.json`.

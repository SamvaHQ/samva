# Samva agent plugin

Connect a coding agent to Samva's organization-scoped email and WhatsApp tools at
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

Both manifests load `skills/samva/SKILL.md` and its eight references. See
[`provenance.json`](./provenance.json) for the pinned source commit, public
skill archive, version, and digests of the skill snapshot in this package.

## Public documentation

The [`docs`](./docs) directory explains Codex and Cursor package loading, the
published ChatGPT plugin, direct Claude MCP connection, authentication and
permission boundaries, and synthetic verification examples. Run
`bun run validate:agent-plugin` from the repository root for the automated
packaging checks.

## SDK and CLI compatibility

Use `samva@^0.43.0` and `@samva/cli@^0.37.0` with this repository's guidance.
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

Verify Samva webhooks with `verify` or `verifyRequest` from `samva/webhooks` and the endpoint
signing secret. The RSA `v2` helpers left the webhooks package in 0.37; HMAC `v1` signing and
verification are unchanged. Delete templates and projects with `templates.delete` and
`templates.deleteProject`, or `samva templates delete` and `samva templates projects delete`:
removal is permanent, and a referenced template returns `TemplateInUseError` (409). Template
reads and writes no longer report `isActive`. Scheduled sends, analytics, conversations, and
knowledge sources take `namespaceId`, or `--namespace` on the CLI.

Topic IDs start with `tpc_`; a request that passes an `unsub_` ID is rejected, so replace the
prefix in stored IDs, newsletter issue front matter, and signup-form subscribe URLs.
`topics.setSubscriptions` never resubscribes a contact who unsubscribed and reports them as
`kept`. Agent drafts and creates take `setupJob` (`support`, `store`, or `booking`) instead of
`preset`, and imports no longer accept `suppressionFree`. Send bare addresses with ASCII dot-atom
local parts. Suppression entries carry `namespaceId`, which `email.listSuppressions` and
`email.countSuppressions` accept as a filter; the CLI manages them with `samva suppressions list`
and `samva suppressions remove`. OAuth and MCP connections can be confined to one namespace. A
namespace credential reaches only uploads with recorded namespace ownership, so upload staged
attachments again with it before sending. Full mailbox draft responses include `revision`.
WhatsApp sends use `messages.send` with `channel: "whatsapp"`; the bundled skill's `whatsapp.md`
reference covers the 24-hour service window and templates.

Organization-level email domains accept `shared` (`--shared` on the CLI domain commands), which
lets namespace credentials read and send from them with their own sending health and
suppressions. `email.setDefaultSender` takes a request body: `{}` for the sender's own scope or
`{ namespaceId }` to set a namespace's default, and a raw HTTP call without a body is rejected.

`organizations.inviteMember` (`samva org invite --namespace`) can restrict a teammate to one
namespace, with `mailboxAddress` naming their personal mailbox. `namespaces.createPortalLink`,
`listPortalLinks`, and `revokePortalLink` (`samva namespaces portal-links`) manage hosted customer
portal links; the URL holds a credential and is returned only on create. Non-send mailbox actions
carry `handoff`, `{ reason }` for a hand-off and `null` otherwise. `email.removeDomain` types its
`409` and `429` responses.

The bundled skill is the immutable snapshot identified in `provenance.json`.

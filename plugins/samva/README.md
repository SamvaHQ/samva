# Samva agent plugin

Connect a coding agent to Samva's organization-scoped email tools at
`https://mcp.samva.dev`. The bundle also includes Samva's canonical agent skill
for choosing between the hosted MCP server, TypeScript SDKs, REST API, CLI,
dashboard, and TSX template editor.

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

Both manifests load `skills/samva/SKILL.md` and its six references. See
[`provenance.json`](./provenance.json) for the source commit, public skill
archive, version, and digests.

## Public documentation

The [`docs`](./docs) directory explains Codex and Cursor package loading,
direct Claude MCP connection, authentication and permission boundaries, and
synthetic verification examples. Run `bun run validate:agent-plugin` from the
repository root for the automated packaging checks.

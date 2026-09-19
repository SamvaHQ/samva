# Codex and Cursor package loading

The Samva package gives Codex and Cursor the same two public components:

- the canonical Samva agent skill under `skills/samva/`
- one remote Streamable HTTP MCP server at `https://mcp.samva.dev`

No secret is embedded in either client configuration. Cursor's configuration
includes Samva's public, pre-registered OAuth client ID; Codex uses Client ID
Metadata Document discovery.

## Codex

Codex discovers `.codex-plugin/plugin.json` at the package root. Its `skills`
field loads `skills/samva/SKILL.md` and the six references linked from that
skill. Its `mcpServers` field loads `.mcp.json`, which defines one HTTP server
named `samva`.

```text
.codex-plugin/plugin.json
  ├─ skills     -> skills/samva/SKILL.md
  └─ mcpServers -> .mcp.json -> https://mcp.samva.dev
```

The Codex manifest declares `Interactive` and `Write` because Samva's hosted
tool set includes both organization-scoped reads and live email operations.

## Cursor

The repository-level `.cursor-plugin/marketplace.json` points the `samva`
entry to `plugins/samva`. Cursor then loads `.cursor-plugin/plugin.json` from
that package. The nested manifest uses the same skill directory and loads its
MCP server from `mcp.json`.

```text
.cursor-plugin/marketplace.json
  -> plugins/samva/.cursor-plugin/plugin.json
       ├─ skills     -> skills/samva/SKILL.md
       └─ mcpServers -> mcp.json -> https://mcp.samva.dev
```

The Cursor manifest requires Cursor `3.13.0` or newer, matching the remote-MCP
plugin schema used by the public marketplace examples on which this package is
based.

Cursor currently requires either Dynamic Client Registration or static client
metadata. Samva keeps unauthenticated registration disabled, so `mcp.json`
supplies the public `samva-cursor-plugin` client ID and the supported scopes.
The client has no secret, requires PKCE, and permits Cursor's desktop and web
OAuth callback URLs.

## Shared behavior

Both clients receive the current tool schemas and annotations from MCP
`tools/list`; the package does not duplicate those schemas. The bundled skill
helps an agent choose among MCP, the TypeScript SDKs, REST, CLI, dashboard, and
TSX template authoring, while the MCP connection performs live operations.

See [authentication and permissions](./auth-and-permissions.md) before using a
write tool, and [verification](./verification.md) for synthetic examples.

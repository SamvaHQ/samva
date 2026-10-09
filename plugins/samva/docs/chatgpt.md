# Samva in ChatGPT

Samva is published as a ChatGPT plugin:
[open the listing](https://chatgpt.com/plugins/plugin_asdk_app_6a8ebcc4c4c48191b5a3a53638f7b972).
The listing is a separate artifact from the Codex and Cursor package in this
directory, which is documented in [Codex and Cursor](./codex-and-cursor.md).

## Two artifacts, two versions

| Artifact                 | Where it lives                     | Version                         |
| ------------------------ | ---------------------------------- | ------------------------------- |
| ChatGPT plugin listing   | The ChatGPT directory link above   | `1.0.0`, managed by the listing |
| Codex and Cursor package | `plugins/samva` in this repository | `0.4.0`                         |

The numbers are not comparable. The package in this repository carries a pinned
snapshot of the Samva agent skill; its source commit and digests are recorded in
[`provenance.json`](../provenance.json). The skill bundled in the ChatGPT
listing is a separate snapshot and is not byte-identical to it.

The hosted MCP server at `https://mcp.samva.dev` is a third component. It
supplies the current tool names, schemas, and annotations on connection, so use
the tools ChatGPT shows after you connect rather than names from any bundled
skill text. A bundled skill guides the model; the connected tools perform live
operations.

## Connect

1. Open the listing and add Samva to ChatGPT.
2. Start the connection when ChatGPT asks you to sign in to Samva.
3. Authenticate and **choose one organization** when you approve the connection.
   The token is bound to that organization.

Adding the plugin is not proof that authentication or the tools work. Treat the
connection as working only after the first read below returns a result.

To use another organization, create a separate connection for it. A connection
does not switch organizations for an existing token, and no tool argument or
model-supplied value overrides the organization chosen at approval. See
[Organizations and tenancy](https://samva.dev/docs/developers/authentication-and-tenancy)
and [Authentication](https://samva.dev/docs/developers/authentication).

## First read-only checks

Start with prompts that only read state:

- "Check whether my email setup is ready to send."
- "Show my email usage and delivery stats for the last 7 days."

The readiness prompt should call the read-only `email_check_readiness` tool. It
reports whether a production send can go out and, when one cannot, the first
obstacle and what clears it. It does not send mail or contact providers. Check
the tool call ChatGPT shows against the connected tool list.

## If something fails

Report what happened. Do not treat a failed or missing tool as success, and do
not ask the assistant to simulate a send, invent a status, or fall back to
another channel.

- If sign-in or organization selection fails, no Samva tool is connected. Retry
  the connection, or disconnect and reconnect.
- If a tool is missing, refresh or reconnect so the client does not keep a stale
  tool catalog.
- If a read returns an error, quote it. The
  [MCP guide](https://samva.dev/docs/developers/mcp) describes authentication
  and the tool families the hosted server exposes.

Whether ChatGPT shows the connected account's profile or distinguishes several
organizations depends on the host, and this guide makes no promise about either.

## Before a write

Reads are the safe starting point. Sends and other mutations change live
organization data: confirm each one deliberately and read
[authentication and permissions](./auth-and-permissions.md) first.

## Current documentation

- [Connect an agent over MCP](https://samva.dev/docs/developers/mcp): endpoint,
  authentication, and the hosted tool catalog.
- [Agent Skills](https://samva.dev/docs/developers/agent-skills): what a skill
  teaches and how it relates to the hosted tools.
- [Authoring templates in TSX](https://samva.dev/docs/sml/authoring-tsx):
  template projects, schemas, fixtures, preview, and publishing.

The older template-document workflow in earlier skill snapshots is superseded by
the TSX workflow above.

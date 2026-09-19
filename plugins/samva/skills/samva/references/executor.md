# Executor

Executor can index either Samva's hosted MCP server or its OpenAPI description and expose the
resulting tools through one governed catalog.

## Choose the Samva surface

- Add `https://mcp.samva.dev` for Samva's curated, organization-scoped agent tools. Prefer this
  for interactive agent workflows and OAuth discovery.
- Add `https://api.samva.dev/v1/openapi.json` for broad REST coverage. Set the base URL to
  `https://api.samva.dev/v1` if Executor asks for one.
- Do not add the Samva CLI as an Executor integration. The CLI remains a terminal surface.

Executor also consumes the public integrations.sh catalog. Inspect Samva's current catalog entry at
<https://integrations.sh/samva.dev>, but treat Samva's owner declaration and live endpoints as the
underlying authority.

## Authenticate

- Hosted MCP supports browser OAuth discovery with no preconfigured headers, or an organization API
  key in `X-API-Key`.
- REST uses an organization API key in `X-API-Key`.

After connecting, review the imported tool schemas and approval policies before enabling writes.
Keep email sends approval-gated until the organization's recipients, idempotency behavior, and sending
domain are verified.

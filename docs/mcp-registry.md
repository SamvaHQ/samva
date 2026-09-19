# Official MCP Registry packet

The root [`server.json`](../server.json) describes Samva's hosted MCP server for
the [official MCP Registry](https://registry.modelcontextprotocol.io/). It is a
remote-only server: clients connect to `https://mcp.samva.dev` over
streamable HTTP and authenticate through Samva's protected-resource metadata.

## Identity and provenance

- Registry name: `dev.samva/mcp`
- Server implementation identity: `dev.samva/mcp` at version `1.0.0`
- Documentation: <https://samva.dev/docs/developers/mcp>
- Source repository: <https://github.com/SamvaHQ/samva>
- GitHub repository ID: `1280248212`
- Remote endpoint: <https://mcp.samva.dev>

The `dev.samva` namespace is the reverse-DNS form of `samva.dev`. The domain
authentication TXT record is managed at the `samva.dev` apex; its private key
must remain outside this repository and outside CI logs. The manifest does not
weaken or replace Samva's OAuth conformance.

## Validation and publish gate

Install the official publisher CLI, then validate the packet locally:

```sh
brew install mcp-publisher
mcp-publisher validate server.json
```

The authenticated publish flow is:

```sh
export MCP_REGISTRY_PRIVATE_KEY='REPLACE_WITH_THE_OUT_OF_BAND_PRIVATE_KEY'
mcp-publisher login dns \
  --domain samva.dev \
  --private-key "$MCP_REGISTRY_PRIVATE_KEY"
mcp-publisher publish
```

The packet is published under the `dev.samva/mcp` registry name. Do not run
`mcp-publisher publish` as part of ordinary repository CI or while reviewing
this packet. Re-publishing an updated manifest is an external registry mutation
and remains a separate, explicit approval step after the manifest, endpoint,
and domain authentication have been reviewed.

The official registry's [server.json specification](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md),
[authentication guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx),
and [registry requirements](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md)
define the schema and namespace rules used by this packet.

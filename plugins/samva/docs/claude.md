# Connect Claude directly

This repository does not package a Claude plugin. Claude clients that support
remote MCP can connect directly to Samva's canonical endpoint:

```text
https://mcp.samva.dev
```

Use the endpoint exactly as shown, with no path suffix. It uses the
`Streamable HTTP` transport rather than SSE. Do not put an API key in this
public package.

## Interactive OAuth

An unauthenticated request advertises OAuth protected-resource metadata.
OAuth-capable Claude clients follow that metadata to Samva's authorization
server, complete interactive sign-in, and return with an organization-scoped
connection bound to the organization approved at consent. Confirm that
organization before invoking a write tool; to use another one, create a separate
connection.

## API-key clients

For an unattended client that cannot use interactive OAuth, create an API key
for one Samva organization and store it only in that client's private secret
configuration. The hosted MCP accepts it as `X-API-Key` or as a bearer token.
The key determines the organization, so an API-key request does not select a
second organization.

After connecting, the client can discover the current tool and resource
inventory with MCP `tools/list` and `resources/list`. The public operating
reference is `skills/samva/references/mcp.md`.

See [authentication and permissions](./auth-and-permissions.md) for data and
side-effect boundaries and [verification](./verification.md) for synthetic
examples that work across MCP-capable clients.

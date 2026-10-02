# Authentication

Samva has three credential types. Pick by **who is acting**.

For the public agent-facing setup guide, fetch `https://samva.dev/auth.md`. It
is the canonical prose companion to Samva's OAuth protected-resource metadata
and hosted MCP setup. The full reference is
`https://samva.dev/docs/developers/authentication`.

| Credential            | Use for                                | How it scopes the org                      |
| --------------------- | -------------------------------------- | ------------------------------------------ |
| **API key**           | Servers, backends, CI, agents, one org | Key is bound to one organization           |
| **CLI OAuth session** | A person at a terminal, across orgs    | User-scoped; send `x-org-slug` per request |
| **MCP OAuth token**   | An MCP client connected through OAuth  | Bound to the org chosen at consent         |

## API keys

Production keys start with `samva_sk_live_`; keys minted outside production start with
`samva_sk_test_`.

Create one in the Samva dashboard under **Developers → API Keys**. The full value is shown once at
creation. Store it in an environment variable, never in source. Send it as the `X-API-Key` header;
the SDK and CLI do this for you when you set `SAMVA_API_KEY`. Hosted MCP also accepts it as
`Authorization: Bearer samva_sk_live_...`.

The organization is derived from the key, so API-key callers never select an org. Each key carries
`resource:action` permissions; the OpenAPI document states each operation's requirement as
`x-samva-scope`.

## CLI OAuth session (device flow)

`samva login` runs the OAuth 2.0 device authorization flow: it prints a verification URL and code,
opens your browser, and waits for approval. The CLI stores the session token only in the OS
keyring, never in a file, and sends it as `Authorization: Bearer ...`.

- The token is **user-scoped**, so the active org travels separately. Set it with
  `samva org use <slug>` (the CLI sends it as `x-org-slug`), or pass
  `headers: { "x-org-slug": "<slug>" }` to the SDK's `createClient({ authToken })`.
- There is **no refresh token**. Run `samva login` again once the session expires.

Use OAuth for interactive work, especially across multiple organizations. Use an API key for
anything unattended.

## Errors

| Status | `_tag`              | Meaning                                                              |
| ------ | ------------------- | -------------------------------------------------------------------- |
| `401`  | `UnauthorizedError` | Missing, invalid, revoked, or expired credential                     |
| `403`  | `ForbiddenError`    | Missing permission (the `message` names it), or no org for a session |

Every error body is flat JSON with `_tag` and its own fields.
Every error is listed at `https://samva.dev/docs/developers/error-reference`.

```json
{ "_tag": "UnauthorizedError", "message": "Invalid API key" }
```

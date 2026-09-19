# Public verification

Use synthetic data to verify package loading and MCP behavior. The examples
below describe expected public behavior; they do not record a live account or
customer result.

## Automated package conformance

Run from the `Samva` repository root:

```bash
bun run validate:agent-plugin
bunx vitest run plugins/samva/tests/plugin.test.ts
```

The validator proves that:

- both manifests and the Cursor marketplace resolve existing in-package paths
- both MCP configs define exactly one credential-free HTTP server at
  `https://mcp.samva.dev`
- `SKILL.md` resolves all six canonical references
- manifest and skill versions agree with provenance
- the local skill bundle digest matches
- distributable JSON and Markdown contain no embedded credentials or
  unsupported product claims

Negative fixtures cover malformed or missing artifacts, an endpoint mismatch,
credential-bearing MCP config, path escape, missing skill references, stale
digests, disappearing files, and unsupported claims.

## Synthetic read examples

| Prompt                                                            | Expected behavior                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "Check whether my Samva email setup is ready."                    | Calls `email_check_readiness` and returns organization-scoped readiness without mutation. |
| "List my configured email domains."                               | Calls `email_domains_list` and returns only the authenticated organization's domains.     |
| "Show usage totals for this organization."                        | Calls `usage_get` without returning billing or entitlement fields.                        |
| "Get the delivery status for message `<synthetic-message-id>`."   | Calls `messages_get_email_status` and returns a status or typed not-found result.         |
| "Read the current source for template `<synthetic-template-id>`." | Opens the workspace and reads its current source without changing the revision.           |

## Synthetic write examples

| Prompt                                                                             | Expected behavior                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "Send a test email to `<synthetic-address>` with idempotency key `verify:test-1`." | The client surfaces the destructive/open-world annotation, then calls `messages_send_email` once after confirmation. |
| "Retry the send with the same idempotency key but changed content."                | The agent explains that changed input with the same key conflicts and does not present the retry as safe.            |
| "Publish the current template workspace."                                          | The agent reads the current revision and confirms the explicit save/publish action before invoking it.               |
| "Open the billing portal and change my plan."                                      | The agent explains that billing actions are outside the MCP inventory and points to the dashboard.                   |

Keep every address, id, template, domain, and webhook endpoint synthetic and
owned by the organization used for verification.

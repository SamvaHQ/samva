# Authentication, data, and permissions

Samva's hosted MCP is organization-scoped. Choose the authentication mode by
who is acting:

| Mode    | Best for                          | Organization scope             |
| ------- | --------------------------------- | ------------------------------ |
| OAuth   | A person working interactively    | Organization chosen at consent |
| API key | Servers and unattended automation | Organization bound to the key  |

An OAuth connection stays bound to the organization approved at consent;
changing the active organization elsewhere does not move it. To work in another
organization, create a separate connection.

Keep API keys in private client secret storage. Never commit them to an MCP
configuration, environment example, prompt, or evidence file.

The Cursor package includes the public OAuth client ID
`samva-cursor-plugin`. It is not a secret: the registered client authenticates
as a public client and Samva requires PKCE for every authorization-code flow.

## Data boundary

Read tools can expose the authenticated organization's email configuration,
contacts, messages and events, inbound email, templates, campaigns, webhooks,
usage, and readiness data. The MCP surface does not expose billing status,
entitlements, or billing-portal actions.

Webhook signing secrets can be retrieved again with `webhooks_get_secret`,
`samva webhooks secret <webhook-id>`, or the SDK's
`client.webhooks.getSecret({ id })`. The native Effect equivalent is
`Webhooks.getSecret({ id })` from `samva/effect/webhooks`; its `secret` is
`Redacted`. The SDK and CLI return `secret`, `createdAt`, and
`previousExpiresAt`; MCP returns `webhookId` and `signingSecret`. Reading the
secret requires `webhooks:update` permission. Treat the result as a credential:
keep it out of prompts, logs, and evidence files.

With `@samva/cli@0.18.0`, webhook create and rotate results no longer include
`displayOnce`; `webhooks secret --json` returns the fields inside `data`.
API-key secrets remain shown once on create or rotation; API-key reads do not
retrieve them. See the [SDK release](https://github.com/AryaLabsHQ/samva/releases/tag/v0.21.0),
[CLI release](https://github.com/AryaLabsHQ/samva/releases/tag/cli%400.18.0), and
[webhook signing guide](https://samva.dev/docs/platform/webhooks).

Use synthetic recipient addresses, content, domains, templates, and webhook
endpoints when exploring the integration. Do not inspect or send customer data
unless the task explicitly requires it and the caller is authorized for that
organization.

## Side-effect boundary

Write tools can persist Samva resources. Some tools also deliver traffic
outside Samva. The hosted server's tool-level MCP annotations are authoritative
and should be shown by the client before invocation.

The canonical MCP tool inventory marks these external deliveries as
`readOnlyHint: false`, `destructiveHint: true`, and `openWorldHint: true`:

- `messages_send_email`
- `scheduled_messages_schedule_email`
- `campaigns_schedule_run`
- `webhooks_test`
- `webhooks_retry_delivery`

`messages_send_email` remains `idempotentHint: false` because its
`idempotencyKey` is optional. A particular send is retry-safe only when the
caller supplies a stable key for the same logical input.

`scheduled_messages_cancel` changes Samva state but is closed-world
(`openWorldHint: false`). `webhooks_rotate_secret` is destructive and
closed-world. Domain, sender, webhook, schedule, campaign, and template-workspace
mutations should be confirmed deliberately from their current tool schema.

## Public resources

The hosted server exposes five operating references:

- `samva://guide/email`
- `samva://guide/template-editor`
- `samva://guide/scheduling`
- `samva://reference/contract`
- `samva://reference/sml`

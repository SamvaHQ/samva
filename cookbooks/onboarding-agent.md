# Onboard a WhatsApp contact with a code module

The [onboarding agent example](../examples/onboarding-agent) declares a contact-scoped Samva MCP
grant, lifecycle triggers, owner approval floors, and an approved WhatsApp follow-up template.
The instructions and skill are placeholders for the operator to supply before publishing.

```text
WhatsApp contact → request_connection → authorization page and emailed code
                → merge_verified_contact → connected Samva MCP tools
                → starter template + brand fields → owner approval for domain and sender
                → domain.updated → WhatsApp follow-up
```

`request_connection` and `merge_verified_contact` are conversation-host tools. Code modules inherit
them; do not shadow them with module tools or send an email typed in chat to the merge API. The
host derives the conversation contact, connection and signed admission. The SDK also exposes
`contacts.merge({ id, from })` and `contacts.mergeByConnection({ id, connection })` for their
authorized API callers; the module's direct SDK transport does not grant those routes.

Account work uses the contact's connected Samva MCP tools, either directly in the conversation or
through `ctx.connections.call(integrationId, tool, input)`. The module's `ctx.samva` mailbox
capability is separate from the connected owner's account.

## Scope the account work

`templates_create_from_website` creates a starter project and returns an assistant request. It does
not restyle the email or update a brand. `templates_create_from_brief` handles a description.
Read brands with `brands_list` and `brands_get`, then update their fields with `brands_update`.
Brand sections replace whole sections, so preserve fields the customer has not asked to change.
Never describe the result as a finished design, a published template, or a delivered message.

Connected-tool names have the catalog prefix `samva.`; for example, call
`ctx.connections.call(integrationId, "samva.brands_get", { arguments: { slug } })`. Grants and policy matches use
these qualified names. The MCP server itself advertises unqualified names.

The manifest permits only the reads and writes needed for this flow. It requires person approval
for `samva.email_domains_add` and `samva.email_senders_add`; the host also applies its integration policy.
Present the approval page and wait for its recorded decision. Observe domain status before
claiming verification. Do not retry a held action as a new write.

## Resume on lifecycle events

`eventTriggers` subscribes the conversation to `contact.connection_completed`, `domain.updated` and `review.updated`. These are
conversation turns with event context, not authored `events` handlers. Platform lifecycle routing
must be configured for the owner email's contact; verified binding joins that identity to the
WhatsApp contact.

Inside the 24-hour WhatsApp service window, use the ordinary reply path. Outside it, the configured
approved follow-up template is required. Preserve idempotency and inspect receipts rather than
assuming a reply was sent. Credentials and verification codes stay on the authorization page;
WhatsApp setup stays in the dashboard.

## Validate before publishing

Run the example's typecheck, offline eval, build and info commands. Published `samva@0.46.1` lacks
the agent exports; the README documents developing with a local SDK link without committing it.
The needed release includes code-first agents and the flat connection-merge contract. Offline
declaration checks do not establish the conversation flow; verify sign-in, identity binding,
approval and event-driven delivery through a managed E2E run before enabling the agent.

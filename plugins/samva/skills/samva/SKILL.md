---
name: samva
description: >-
  Integrate and operate Samva email across the Promise and Effect TypeScript
  SDKs, REST API, CLI, hosted MCP server, dashboard, and TSX template editor.
  Use for sending and tracking email, domains and senders, inbound receiving,
  webhooks, templates, schedules, campaigns, usage, readiness, authentication,
  or choosing the right Samva surface. Triggers on samva, samva.dev, the
  `samva` package, `@samva/cli`, mcp.samva.dev, SAMVA_API_KEY, SML, Samva
  Markup Language, and template editor agent.
metadata:
  version: 0.3.0
---

# Samva

Use Samva's organization-scoped email surfaces for transactional sends,
templates, scheduled email, campaigns, inbound receiving, webhooks, and
operational checks.

## Choose the surface

```text
What is the intent?
├─ Add Samva to async/await TypeScript code   → Promise SDK (`samva` or `samva/promises`)
├─ Add Samva to an Effect application         → Effect SDK (`samva/effect`)
├─ Call Samva from another runtime            → REST (`https://api.samva.dev/v1`)
├─ Run or script terminal workflows           → CLI (`@samva/cli`)
├─ Give an AI agent live Samva tools           → hosted MCP (`https://mcp.samva.dev`)
├─ Configure or inspect resources visually     → dashboard (`https://samva.dev`)
└─ Author or repair a TSX email template      → template authoring reference
```

| Surface     | Best for                                   | Authentication                   |
| ----------- | ------------------------------------------ | -------------------------------- |
| Promise SDK | TypeScript with Promises                   | API key or OAuth bearer          |
| Effect SDK  | Native typed Effect programs               | API key or OAuth bearer          |
| REST        | Non-TypeScript runtimes and direct HTTP    | API key or OAuth bearer          |
| CLI         | Terminal automation and operator workflows | `SAMVA_API_KEY` or `samva login` |
| Hosted MCP  | Agents taking live actions                 | API key or OAuth                 |
| Dashboard   | Visual setup, inspection, and billing      | Browser session                  |

Read only the reference needed for the selected surface:

- [SDK and REST](references/sdk.md): Promise SDK, Effect SDK, and direct HTTP.
- [CLI](references/cli.md): installation, authentication, and shipped command families.
- [Hosted MCP](references/mcp.md): endpoint, public tool families, resources, and safe retries.
- [Template authoring](references/template-authoring.md): revision-safe TSX editing and QA.
- [Authentication](references/auth.md): API keys, OAuth, and organization scoping.
- [Executor](references/executor.md): add Samva's MCP or REST surface to an Executor workspace.

## Common operating rules

1. Authenticate with an API key for unattended work. Use OAuth for interactive multi-organization
   work.
2. Keep the organization implicit with an API key. For OAuth, select or send the organization slug.
3. Use a stable idempotency key for any send that an automation may retry. Reuse the same key only
   for the same logical request.
4. Read a resource after mutating it when later work depends on its current status or revision.
5. Keep secrets in environment variables. Production API keys start with `samva_sk_live_`; keys
   outside production start with `samva_sk_test_`.

Production API base URL: `https://api.samva.dev/v1`.

Hosted MCP endpoint: `https://mcp.samva.dev`.

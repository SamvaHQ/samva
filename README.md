# Samva

Packages, examples, cookbooks, and agent plugins for building on
[Samva](https://samva.dev), email and WhatsApp for AI agents.

Samva gives an agent its own email address and WhatsApp number. It sends and
receives on both through one API, hosted MCP, or the CLI, gets every reply back
threaded to its conversation, and works under rules that hold what a person
should approve. Use this repository to send transactional email, connect auth
email flows, work with templates, receive replies and delivery events as signed
webhooks, and give an agent its own mailbox. Ask questions about the code on
[DeepWiki](https://deepwiki.com/SamvaHQ/samva).

## Start here

**From an MCP client.** Samva's hosted MCP server is at `https://mcp.samva.dev` and signs in with
OAuth. In Claude Code:

```sh
claude mcp add --transport http samva https://mcp.samva.dev
```

Setup guides: [Claude Code](https://samva.dev/docs/integrations/claude-code),
[Codex](https://samva.dev/docs/integrations/codex),
[Cursor](https://samva.dev/docs/integrations/cursor), and
[opencode](https://samva.dev/docs/integrations/opencode).

**From code.** Create a mailbox on a hosted address, which needs no DNS setup, and send from it:

```ts
import { createClient } from "samva";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const mailbox = await samva.mailboxes.create({
  endpoint: { channel: "email", address: "support@acme.samva.email" },
  name: "Support",
});

await samva.mailboxes.sendMessage({
  id: mailbox.id,
  to: ["customer@example.com"],
  subject: "Your support request",
  text: "We are looking into your request.",
});
```

**From a terminal.**

```sh
npm install -g @samva/cli
samva login
samva org use <slug>   # `samva org list` shows your organizations
samva mailboxes create --address support@acme.samva.email --name Support
samva mailboxes events mbx_...
```

Replies come back as signed webhooks or over the mailbox event stream. The
[`mailbox-agent`](./examples/mailbox-agent) example is a complete agent that follows that stream and
replies in approval mode, and [Give an agent an inbox](https://samva.dev/docs/mailboxes) is the full
tutorial. The free plan needs no card and includes one mailbox; WhatsApp is on paid plans.

## Structure

- `packages/*` — package integrations (`@samva/*`).
- `examples/*` — complete, runnable example apps.
- `cookbooks/*.md` — documentation-first, copy-pasteable recipes.
- `plugins/*` — coding-agent plugins and public documentation.

While Samva is 0.x, the maintained integrations support only the current SDK minor: 0.43. Workspace
packages require `samva@^0.43.0` as a peer and test against `0.43.0`. Examples use
`samva@^0.43.0`; copyable external import maps pin `samva@0.43.0`.

## Package integrations

- [`@samva/better-auth`](./packages/better-auth) — Better Auth email callbacks
  powered by Samva.
- [`@samva/email-sdk`](./packages/email-sdk) — Provider-owned Samva community
  adapter for Email SDK.

## Agent plugins

- [`samva`](./plugins/samva) — OpenAI Codex and Cursor packaging for the
  canonical hosted MCP server and Samva agent skill.
- [Samva in ChatGPT](./plugins/samva/docs/chatgpt.md) — the published ChatGPT
  plugin is a separate listing from the Codex and Cursor package; the guide
  covers connecting one organization and a read-only first check.

## Cookbooks

Agents and mailboxes:

- [`Mailboxes`](./cookbooks/mailboxes.md)
- [`Inbound email replies`](./cookbooks/inbound-email.md)

Frameworks and auth:

- [`Astro`](./cookbooks/astro.md)
- [`Auth.js`](./cookbooks/authjs.md)
- [`Better Auth`](./cookbooks/better-auth.md)
- [`Clerk`](./cookbooks/clerk.md)
- [`Effect SDK`](./cookbooks/effect-sdk.md)
- [`Email SDK`](./cookbooks/email-sdk.md)
- [`Hono on Cloudflare Workers`](./cookbooks/hono-cloudflare-workers.md)
- [`Next.js`](./cookbooks/nextjs.md)
- [`Prisma`](./cookbooks/prisma.md)
- [`Supabase Auth`](./cookbooks/supabase-auth.md)
- [`SvelteKit`](./cookbooks/sveltekit.md)
- [`TanStack Start`](./cookbooks/tanstack-start.md)

Templates:

- [`React Email`](./cookbooks/react-email.md)
- [`TSX templates`](./cookbooks/tsx-templates.md)

Integrations land as individual pull requests. See
[CONTRIBUTING.md](./CONTRIBUTING.md) to propose or build one.

## Examples

Agents and mailboxes:

- [`mailbox-agent`](./examples/mailbox-agent) — an agent that follows a mailbox
  event stream and replies in approval mode, plus the same behavior as an
  `@samva/mailbox` webhook extension.
- [`mailbox-agent-claude`](./examples/mailbox-agent-claude) — an agent that asks
  Claude to draft each reply to a mailbox's email and WhatsApp messages and sends
  it held for a person's approval.
- [`inbound-email-replies`](./examples/inbound-email-replies) — receives an
  inbound reply, verifies the signed webhook, and answers in-thread.

Frameworks, auth, and templates:

- [`astro-email`](./examples/astro-email) — Astro Action and JSON endpoint on
  Cloudflare Workers.
- [`better-auth-nextjs`](./examples/better-auth-nextjs) — Better Auth callbacks
  in a Next.js App Router application.
- [`clerk-webhook`](./examples/clerk-webhook) — Clerk webhook verification and
  transactional email in Next.js.
- [`effect-sdk`](./examples/effect-sdk) — Email sends through the `samva/effect`
  SDK entrypoint.
- [`email-sdk`](./examples/email-sdk) — Email SDK sends through the provider-owned
  Samva community adapter.
- [`hono-cloudflare-workers`](./examples/hono-cloudflare-workers) — Hono Worker
  with a JSON email endpoint.
- [`nextjs-transactional`](./examples/nextjs-transactional) — App Router
  contact form plus `/api/send` route handler using the Samva SDK.
- [`react-email-samva`](./examples/react-email-samva) — React Email rendering
  and delivery through Samva.
- [`supabase-auth-hook`](./examples/supabase-auth-hook) — Supabase Auth Send
  Email Hook implemented as an Edge Function.
- [`sveltekit-transactional`](./examples/sveltekit-transactional) — SvelteKit
  form action and raw email endpoint.
- [`tanstack-start-transactional`](./examples/tanstack-start-transactional) —
  TanStack Start server function and server route.
- [`tsx-template-samva`](./examples/tsx-template-samva) — a `defineTemplate`
  email project: check, render, preview, and publish with the Samva CLI.

## Getting started

This is a [Bun](https://bun.com) + [Turborepo](https://turborepo.com) monorepo.

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
```

## Related open source

- [SML](https://github.com/SamvaHQ/SML) — the markup, Vite plugin, and editor
  behind Samva's TSX templates.
- [DomainKit](https://github.com/AryaLabsHQ/domainkit) — Samva sets up customer
  domains with DomainKit. See
  [how it works](https://domain-kit.dev/customers/samva).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for local
setup, package conventions, and how to propose a new integration. Maintainers
use the [Tegami release flow](./docs/releases.md) for package versions,
changelogs, npm publication, tags, and GitHub Releases. GitHub Actions
publishes; merging the Version Packages pull request is the human gate.

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md). Please do not file
public issues for security reports.

## License

[MIT](./LICENSE) © Arya Labs, Inc.

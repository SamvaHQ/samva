# Samva

Open-source packages, examples, cookbooks, and agent plugins for integrating
[Samva](https://samva.dev) into real applications.

Use these to send transactional email, connect auth email flows, work with
templates, handle delivery events, and verify signed webhooks.

## Structure

- `packages/*` — package integrations (`@samva/*`).
- `examples/*` — complete, runnable example apps.
- `cookbooks/*.md` — documentation-first, copy-pasteable recipes.
- `plugins/*` — coding-agent plugins and public documentation.

The maintained integrations target the published Samva 0.3 email SDK. Workspace
packages and examples use `samva@^0.3.0`; copyable external import maps pin
`samva@0.3.0`.

## Package integrations

- [`@samva/better-auth`](./packages/better-auth) — Better Auth email callbacks
  powered by Samva.
- [`@samva/email-sdk`](./packages/email-sdk) — Provider-owned Samva community
  adapter for Email SDK.

## Agent plugins

- [`samva`](./plugins/samva) — OpenAI Codex and Cursor packaging for the
  canonical hosted MCP server and Samva agent skill.

## Cookbooks

- [`Astro`](./cookbooks/astro.md)
- [`Auth.js`](./cookbooks/authjs.md)
- [`Better Auth`](./cookbooks/better-auth.md)
- [`Clerk`](./cookbooks/clerk.md)
- [`Effect SDK`](./cookbooks/effect-sdk.md)
- [`Email SDK`](./cookbooks/email-sdk.md)
- [`Hono on Cloudflare Workers`](./cookbooks/hono-cloudflare-workers.md)
- [`Inbound email replies`](./cookbooks/inbound-email.md)
- [`Next.js`](./cookbooks/nextjs.md)
- [`Prisma`](./cookbooks/prisma.md)
- [`React Email`](./cookbooks/react-email.md)
- [`Supabase Auth`](./cookbooks/supabase-auth.md)
- [`SvelteKit`](./cookbooks/sveltekit.md)
- [`TanStack Start`](./cookbooks/tanstack-start.md)

Integrations land as individual pull requests. See
[CONTRIBUTING.md](./CONTRIBUTING.md) to propose or build one.

## Examples

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
- [`inbound-email-replies`](./examples/inbound-email-replies) — receives an
  inbound reply, verifies the signed webhook, and answers in-thread.
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

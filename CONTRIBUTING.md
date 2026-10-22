# Contributing

Thanks for your interest in improving Samva integrations. This guide covers
local setup, the conventions every integration follows, and how to propose new
ones.

## Prerequisites

- [Bun](https://bun.com) `>= 1.4.4` (the repo's package manager)
- Node.js `>= 24.10.0`

## Local setup

```sh
bun install
```

Common tasks (run from the repo root):

```sh
bun run build         # build all packages
bun run typecheck     # type-check with tsgo
bun run test          # run the Vitest suite
bun run lint          # oxlint
bun run format:check  # oxfmt --check
```

`bun run lint:fix` and `bun run format` apply fixes.

## Repository layout

- `packages/*` — published integration packages (`@samva/*`).
- `examples/*` — complete, runnable example apps.
- `cookbooks/*.md` — documentation-first, copy-pasteable recipes.

## Integration conventions

Every integration package should:

- Ship a `README.md` with install, minimal usage, configuration, and any safety
  notes.
- Include tests that mock Samva API responses rather than calling the network.
- Handle unsupported inputs **loudly** — reject fields the integration cannot
  honor instead of silently dropping them.
- Never fall back to stub or demo delivery. If credentials or a client are
  missing, fail clearly.
- Delegate concerns owned by the upstream library (for example, auth token
  generation and validation) to that library. Samva is responsible for
  delivery, templates, events, and visibility.

Packages that receive webhooks should verify signatures by default. Packages
that expose tools to agents should default to draft/approval flows for outbound
sends.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages and PR titles (e.g. `feat(<integration>): ...`).
- Keep changes scoped; run `build`, `typecheck`, `test`, `lint`, and
  `format:check` before opening a PR.

User-visible package changes also need a pending Tegami changelog under
`.tegami/`. See [the release guide](./docs/releases.md) for the file format and
package names. Commit the changelog with the implementation it describes; do
not edit package `CHANGELOG.md` files or `.tegami/publish-lock.yaml` directly.
After the changelog reaches `main`, GitHub Actions opens the Version Packages
pull request.

## Proposing a new integration

Open an integration request issue first so we can align on scope, package shape,
and naming before you invest in an implementation.

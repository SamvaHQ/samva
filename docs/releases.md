# Releasing Samva integration packages

This repository uses [Tegami](https://tegami.fuma-nama.dev) for changelogs,
version pull requests, npm publication, Git tags, and GitHub Releases.

GitHub Actions publishes the public packages through two workflows.
`.github/workflows/prepare-release.yml` runs `bun run tegami version` on a
nightly schedule or a manual dispatch. When `.tegami/` has pending changelog
files it opens or updates a Version Packages pull request and writes
`.tegami/publish-lock.yaml`. Merging that pull request is the human gate: the
merge closes it on branch `tegami/version-packages`, which triggers
`.github/workflows/publish.yml` and runs `bun run tegami ci` to publish from the
lock. Ordinary pushes to `main` do not publish. Do not auto-merge that PR with
`GITHUB_TOKEN` — GitHub will not re-run workflows for commits created by that
token, so publish would never start.

To validate a pending lock without publishing, dispatch `publish.yml` with
`dry_run` enabled; it runs `bun run tegami publish --dry-run` instead.

Authentication is npm trusted publishing (OIDC). The workflow sets
`id-token: write` and does not use an `NPM_TOKEN`. Each public package on
npmjs.com must list GitHub Actions trusted publisher
`SamvaHQ/samva` with workflow filename `publish.yml` and no
environment name. Do not rename `publish.yml`; npm pins that filename.

This repository is public, so npm attaches provenance attestations to trusted
publishes. Current `0.1.1` tarballs were attended local publishes and have none.

The public packages version independently:

- `@samva/better-auth` — release group `better-auth`
- `@samva/email-sdk` — release group `email-sdk`

Pull requests that add Tegami changelog files get a release preview comment
from the split `tegami-pr.yml` / `tegami-pr-comment.yml` workflows.

## Queue a change

Run `bun run tegami` to create a pending file under `.tegami/`, or write one as
`YYYY-MM-DD-{hash}.md`:

```md
---
packages:
  "@samva/email-sdk": patch
---

## Preserve Email SDK metadata

The adapter now forwards normalized metadata to Samva.
```

Use `@samva/better-auth`, `@samva/email-sdk`, `group:better-auth`, or
`group:email-sdk` as the package key, with a `patch`, `minor`, or `major` bump.
Commit the pending changelog with the user-visible change it describes. Do not
edit package `CHANGELOG.md` files or `.tegami/publish-lock.yaml` directly.
After the changelog reaches `main`, Actions opens the Version Packages pull
request.

## Version Packages pull request

Review the generated version bump, changelog aggregation, lockfile, and
`.tegami/publish-lock.yaml`. Merge it in the GitHub UI (or with a
non-`GITHUB_TOKEN` actor). Merging triggers `publish.yml`, which publishes and
creates GitHub Releases.

Before publishing, `afterPreflight` runs `bun run release:packages:check`: it
builds each canonical package root twice and requires the packed tarballs to be
byte-identical across both clean builds. Each tarball must carry `README.md`,
`LICENSE`, and `AGENTS.md`, must not include `.map`, `src/`, or `scripts/` files
or an embedded checkout path, must resolve every dependency to a public
registry range, and must declare public MIT `license` and `repository`
metadata.

## Verify a publish

```sh
gh run list --workflow=publish.yml --limit 5
gh run list --workflow=prepare-release.yml --limit 5
npm view @samva/better-auth version dist-tags --json
npm view @samva/email-sdk version dist-tags --json
gh release list --limit 10
```

If a publish job fails partway through, fix the cause and re-run the same
workflow. The publish lock makes retries safe.

## Emergency local publish

Use laptop publish only when Actions cannot. From a clean, current `main` with
npm 2FA:

```sh
npm whoami
GH_TOKEN="$(gh auth token)" bun run release
```

Restore CI as the default path after that emergency succeeds.

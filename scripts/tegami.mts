#!/usr/bin/env bun

/**
 * CI and local release config for Samva integration packages.
 *
 * Tegami owns changelogs, version pull requests, npm registry preflight,
 * dependency ordering, publication, Git tags, and GitHub Releases. Repository
 * checks still build and audit the canonical workspace package roots before a
 * publish can start.
 */

import { tegami, type TegamiPlugin } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

const REPOSITORY = "SamvaHQ/samva";
const publicNames = new Set(["@samva/better-auth", "@samva/email-sdk"]);

const releaseChecks = (): TegamiPlugin => ({
  name: "samva-release-checks",
  enforce: "pre",
  async afterPreflight({ plan }) {
    const shouldPublish = [...plan.packages.entries()].some(
      ([id, packagePlan]) =>
        publicNames.has(this.graph.get(id)?.name ?? "") &&
        packagePlan.preflight?.shouldPublish === true,
    );
    if (!shouldPublish) return;

    if (plan.options.dryRun) {
      console.log("[dry-run] would build and audit both public integration package roots");
      return;
    }

    const child = Bun.spawn(["bun", "run", "release:packages:check"], {
      cwd: this.cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) {
      throw new Error("Public integration package audit failed");
    }
  },
});

const paper = tegami({
  ignore: ["@samva/integrations", /^@samva-examples\//],
  npm: {
    client: "bun",
    updateLockFile: true,
    trustedPublish: {
      provider: "github",
      workflow: "publish.yml",
    },
    bumpDep: ({ dependent, kind }) => {
      if (!publicNames.has(dependent.name)) return false;
      // Peer ranges are declared, not rewritten: a peer bump is a decision for
      // the affected package's own changelog, matching the platform repo.
      switch (kind) {
        case "dependencies":
        case "optionalDependencies":
          return "patch";
        default:
          return false;
      }
    },
  },
  groups: {
    "better-auth": { syncBump: true, syncGitTag: true },
    "email-sdk": { syncBump: true, syncGitTag: true },
  },
  packages: {
    "@samva/better-auth": { group: "better-auth" },
    "@samva/email-sdk": { group: "email-sdk" },
  },
  plugins: [
    github({
      repo: REPOSITORY,
      pushTags: true,
      versionPr: {
        branch: "tegami/version-packages",
        base: "main",
        forceCreate: false,
        create() {
          return { title: "chore(release): prepare integration packages" };
        },
      },
      release: {
        create({ tag }) {
          return { title: tag };
        },
      },
    }),
    releaseChecks(),
  ],
});

await runCli(paper);

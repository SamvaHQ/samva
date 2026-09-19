#!/usr/bin/env bun

/**
 * Reproducible packaging audit for Samva's public integration packages.
 *
 * The platform repository splits release packing into
 * `scripts/build-public-packages.ts` (one pass over every canonical root) and
 * `scripts/check-public-packages.ts` (build twice, then compare and audit the
 * tarballs). This repository has no central release artifact root: each package
 * publishes from its own workspace root, so `bun pm pack` is the packer and
 * there is nothing to mirror as a separate build script. This script keeps the
 * two-pass audit shape in one file.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Manifest = {
  readonly name: string;
  readonly version: string;
  readonly license?: string;
  readonly repository?: unknown;
  readonly publishConfig?: { readonly access?: unknown };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};

const packageRoots = ["packages/better-auth", "packages/email-sdk"] as const;
const repositoryRoot = resolve(import.meta.dir, "..");
const repositoryPaths = new Set([repositoryRoot, await realpath(repositoryRoot)]);
const internalPackages = /@samva\/ai-sdk|@samva-examples\//;
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"] as const;
const repositoryOnlyRange = /^(?:catalog:|file:|link:|workspace:)/;
const requiredFiles = [
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/AGENTS.md",
];

const expectedVersions = new Map<string, string>();
for (const root of packageRoots) {
  const manifest = JSON.parse(
    await readFile(join(repositoryRoot, root, "package.json"), "utf8"),
  ) as Manifest;
  expectedVersions.set(manifest.name, manifest.version);
}
const expectedNames = new Set(expectedVersions.keys());

const run = (command: ReadonlyArray<string>, cwd = repositoryRoot): string => {
  const result = Bun.spawnSync({ cmd: [...command], cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString();
};

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};

// One clean build-and-pack pass over every public root. `dist` is removed
// before each build so a pass never inherits stale hashed chunks from a local
// build, and `--ignore-scripts` keeps the pack itself byte-deterministic.
const buildAndPack = async (destination: string): Promise<ReadonlyArray<string>> => {
  await mkdir(destination, { recursive: true });
  for (const root of packageRoots) {
    const packageRoot = join(repositoryRoot, root);
    await rm(join(packageRoot, "dist"), { recursive: true, force: true });
    run(["bun", "run", "build"], packageRoot);
    run(
      ["bun", "pm", "pack", "--ignore-scripts", "--destination", destination, "--quiet"],
      packageRoot,
    );
  }
  const tarballs = (await readdir(destination)).filter((name) => name.endsWith(".tgz")).sort();
  assert(tarballs.length === expectedNames.size, `Expected ${expectedNames.size} public tarballs`);
  return tarballs;
};

const firstDir = await mkdtemp(join(tmpdir(), "samva-public-pack-a-"));
const secondDir = await mkdtemp(join(tmpdir(), "samva-public-pack-b-"));
try {
  const firstTarballs = await buildAndPack(firstDir);
  const firstDigests = new Map(
    await Promise.all(
      firstTarballs.map(async (name) => [name, await sha256(join(firstDir, name))] as const),
    ),
  );

  const tarballs = await buildAndPack(secondDir);
  for (const name of tarballs) {
    assert(
      firstDigests.get(name) === (await sha256(join(secondDir, name))),
      `${name} is not reproducible across two clean builds`,
    );
  }

  const seen = new Set<string>();
  for (const tarball of tarballs) {
    const tarballPath = join(secondDir, tarball);
    const contents = run(["tar", "-tzf", tarballPath]).trim().split("\n");
    for (const required of requiredFiles) {
      assert(contents.includes(required), `${tarball} is missing ${required}`);
    }
    const forbidden = contents.filter(
      (path) => path.endsWith(".map") || path.includes("/src/") || path.includes("/scripts/"),
    );
    assert(
      forbidden.length === 0,
      `${tarball} contains source-only files:\n${forbidden.join("\n")}`,
    );

    const manifestText = run(["tar", "-xOf", tarballPath, "package/package.json"]);
    assert(
      !/workspace:|catalog:/.test(manifestText),
      `${tarball} contains an unresolved workspace or catalog dependency`,
    );
    assert(
      !internalPackages.test(manifestText),
      `${tarball} exposes an internal workspace dependency`,
    );
    const manifest = JSON.parse(manifestText) as Manifest;
    assert(expectedNames.has(manifest.name), `${tarball} has unexpected name ${manifest.name}`);
    assert(!seen.has(manifest.name), `Duplicate tarball for ${manifest.name}`);
    seen.add(manifest.name);
    assert(
      manifest.version === expectedVersions.get(manifest.name),
      `${manifest.name} has unexpected version ${manifest.version}`,
    );
    assert(
      manifest.license === "MIT" && manifest.repository,
      `${manifest.name} is missing public license or repository metadata`,
    );
    assert(
      manifest.publishConfig?.access === "public",
      `${manifest.name} must publish with public access`,
    );
    for (const field of dependencyFields) {
      for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
        assert(
          typeof range === "string" && !repositoryOnlyRange.test(range),
          `${manifest.name} ${field}.${dependency} must use a public registry range`,
        );
      }
    }

    const temp = await mkdtemp(join(tmpdir(), "samva-public-audit-"));
    try {
      run(["tar", "-xzf", tarballPath, "-C", temp]);
      const textFiles = contents.filter((path) => /\.(?:[cm]?[jt]s|json|md)$/.test(path));
      for (const path of textFiles) {
        const text = await readFile(join(temp, path), "utf8");
        assert(
          ![...repositoryPaths].some((repositoryPath) => text.includes(repositoryPath)),
          `${tarball} embeds the build checkout path in ${path}`,
        );
        assert(
          !internalPackages.test(text),
          `${tarball} exposes an internal package name in ${path}`,
        );
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  assert(seen.size === expectedNames.size, "Public package set is incomplete");
  console.log(`Public package audit passed (${tarballs.length} reproducible Bun tarballs)`);
} finally {
  await rm(firstDir, { recursive: true, force: true });
  await rm(secondDir, { recursive: true, force: true });
}

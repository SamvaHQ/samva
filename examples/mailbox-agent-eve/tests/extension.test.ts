import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

import { afterEach, test, vi } from "vitest";

const names = ["SAMVA_API_KEY", "SAMVA_MAILBOX_ID", "SAMVA_WEBHOOK_SECRET"] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("fails at startup, naming the variable, when configuration is missing", async () => {
  for (const missing of names) {
    for (const name of names) vi.stubEnv(name, name === missing ? "" : "value");
    vi.resetModules();
    await assert.rejects(import("../agent/extensions/samva"), new RegExp(missing));
  }
});

test("mounts the Samva extension when the environment is complete", async () => {
  for (const name of names) vi.stubEnv(name, "value");
  const mount = await import("../agent/extensions/samva");
  assert.ok(mount.default);
});

test("tells the model to treat customer messages as untrusted data", async () => {
  const instructions = await readFile(new URL("../agent/instructions.md", import.meta.url), "utf8");
  assert.match(instructions, /untrusted\s+data/);
});

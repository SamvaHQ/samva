import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

test("offline onboarding declarations", async () => {
  const result = await promisify(execFile)("bun", [
    "run",
    fileURLToPath(new URL("../evals/agent.eval.ts", import.meta.url)),
  ]);
  expect(result.stdout).toContain("Onboarding declaration eval passed");
});

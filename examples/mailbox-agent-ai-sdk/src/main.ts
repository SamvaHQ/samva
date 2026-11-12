import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "samva";

import { runAgent } from "./agent";
import type { CursorStore } from "./agent";
import { requireEnv } from "./env";

/** In-memory for the example: a restart resumes live. Persist the cursor in production. */
const memoryStore = (): CursorStore => {
  let cursor: string | undefined;
  return {
    load: async () => cursor,
    save: async (next) => {
      cursor = next;
    },
    clear: async () => {
      cursor = undefined;
    },
  };
};

// Fail at startup, not on the first message: the provider reads this variable lazily.
requireEnv("ANTHROPIC_API_KEY");
const samva = createClient({ apiKey: requireEnv("SAMVA_API_KEY") });

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

await runAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  // Any AI SDK provider works here: swap this one line.
  model: anthropic("claude-opus-5-5"),
  instructions: requireEnv("AGENT_INSTRUCTIONS"),
  store: memoryStore(),
  signal: controller.signal,
});

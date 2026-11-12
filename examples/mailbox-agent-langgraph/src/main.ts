import { ChatAnthropic } from "@langchain/anthropic";
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

const samva = createClient({ apiKey: requireEnv("SAMVA_API_KEY") });
// Reads ANTHROPIC_API_KEY from the environment.
const model = new ChatAnthropic({ model: "claude-opus-5-5" });

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

await runAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  model,
  instructions: requireEnv("AGENT_INSTRUCTIONS"),
  store: memoryStore(),
  signal: controller.signal,
});

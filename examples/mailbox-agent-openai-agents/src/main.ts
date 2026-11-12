import { Runner } from "@openai/agents";
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
// The SDK reads OPENAI_API_KEY itself; checking it here fails at startup instead of on the first
// message. Traces go to OpenAI by default, so keep customer text out of them.
requireEnv("OPENAI_API_KEY");
const runner = new Runner({ traceIncludeSensitiveData: false });

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

await runAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  config: { runner, instructions: requireEnv("AGENT_INSTRUCTIONS") },
  store: memoryStore(),
  signal: controller.signal,
});

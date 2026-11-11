import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "samva";

import { runAgent } from "./agent";
import type { CursorStore } from "./agent";
import { claudeDrafter } from "./draft";
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
// Reads ANTHROPIC_API_KEY, or the credentials `ant auth login` stored.
const anthropic = new Anthropic();

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

await runAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  draft: claudeDrafter(anthropic, requireEnv("AGENT_INSTRUCTIONS")),
  store: memoryStore(),
  signal: controller.signal,
});

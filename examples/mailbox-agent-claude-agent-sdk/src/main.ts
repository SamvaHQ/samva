import { createClient } from "samva";

import { runAgent } from "./agent";
import type { CursorStore } from "./agent";
import { requireEnv } from "./env";
import { claudeTurn } from "./turn";

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

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

// The Agent SDK reads ANTHROPIC_API_KEY, or the credentials of a signed-in Claude Code.
await runAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  turn: claudeTurn(requireEnv("AGENT_INSTRUCTIONS")),
  store: memoryStore(),
  signal: controller.signal,
});

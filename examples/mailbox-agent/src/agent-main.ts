import { createClient } from "samva";

import { runMailboxAgent } from "./agent";
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
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

await runMailboxAgent(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  store: memoryStore(),
  signal: controller.signal,
});

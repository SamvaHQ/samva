import { createClient } from "samva";

import { requireEnv } from "./env";
import { httpForward, runRelay } from "./relay";
import type { CursorStore } from "./relay";

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

await runRelay(samva, {
  mailboxId: requireEnv("SAMVA_MAILBOX_ID"),
  forward: httpForward(
    process.env.EVE_URL ?? "http://127.0.0.1:2000",
    requireEnv("EVE_RELAY_TOKEN"),
  ),
  store: memoryStore(),
  signal: controller.signal,
});

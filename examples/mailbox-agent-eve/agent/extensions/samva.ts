import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import samva from "@samva/eve";

/** Fail at startup, not on the first message, when a required variable is missing. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Missing required env var ${name}`);
  return value;
}

export default samva({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhook: {
    secret: required("SAMVA_WEBHOOK_SECRET"),
    // Samva delivers each event at least once. The state adapter records delivery ids, so
    // instances that share one (Redis here) answer a redelivered event once. Memory state is
    // for a single local process.
    state: process.env.REDIS_URL ? createRedisState() : createMemoryState(),
  },
});

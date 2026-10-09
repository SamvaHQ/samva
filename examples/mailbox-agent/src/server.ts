import { createWebhookHandler } from "@samva/mailbox/webhook";

import { requireEnv } from "./env";
import extension from "./extension";

const handler = createWebhookHandler(extension, {
  apiKey: requireEnv("SAMVA_API_KEY"),
  webhookSecret: requireEnv("SAMVA_WEBHOOK_SECRET"),
});

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: handler,
});

console.log(`Listening on ${server.url}`);

import type { StateAdapter } from "chat";
import { defineExtension } from "eve/extension";
import { z } from "zod";

export default defineExtension({
  config: z.strictObject({
    apiKey: z.string().trim().min(1),
    mailboxId: z.string().trim().min(1),
    webhook: z
      .strictObject({
        secret: z.string().trim().min(1),
        includeAutomatedEmail: z.boolean().default(false),
        state: z.custom<StateAdapter>(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            "setIfNotExists" in value &&
            typeof value.setIfNotExists === "function",
          "Supply a Chat SDK state adapter",
        ),
      })
      .optional(),
  }),
});

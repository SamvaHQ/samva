import { defineChannel, POST } from "eve/channels";

import { acceptMessage } from "../lib/intake";
import type { MessageRef } from "../lib/message";

// The relay (`src/main.ts`) posts each received mailbox message here. The ids stay in channel
// state, outside the prompt: tools read them from `ctx.channel.metadata`.
export default defineChannel<MessageRef>({
  state: { eventId: "", mailboxId: "", messageId: "", channel: "email" },
  metadata: (state) => ({ ...state }),
  routes: [
    POST("/samva/messages", async (request, { from }) => {
      const token = process.env.EVE_RELAY_TOKEN;
      if (token === undefined || token === "") {
        throw new Error("Missing required env var EVE_RELAY_TOKEN");
      }
      return await acceptMessage(request, token, (address, message, options) =>
        from(address).send(message, options),
      );
    }),
  ],
});

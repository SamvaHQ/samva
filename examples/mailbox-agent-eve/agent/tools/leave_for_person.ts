import { defineTool } from "eve/tools";
import { z } from "zod";

import { claimEvent } from "../lib/claim";
import { parseMessageRef } from "../lib/message";

export default defineTool({
  description: "Leave this message for a person to answer. Nothing is sent.",
  inputSchema: z.object({ reason: z.string().trim().min(1).describe("One short sentence.") }),
  endsTurn: true,
  execute({ reason }, ctx) {
    const ref = parseMessageRef(ctx.channel.metadata);
    if (!claimEvent(ref.eventId))
      return { left: false, reason: "This message was already acted on." };
    return { left: true, messageId: ref.messageId, reason };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";

import { claimEvent, releaseEvent } from "../lib/claim";
import { parseMessageRef } from "../lib/message";
import { samvaFromEnv, submitReply } from "../lib/reply";

// The ids come from the channel's state, so the model supplies only the text: it cannot choose
// the recipient, channel, or thread.
export default defineTool({
  description:
    "Submit a reply to the customer's message. It is held for a person's approval before it is sent.",
  inputSchema: z.object({ text: z.string().trim().min(1).describe("The plain-text reply.") }),
  endsTurn: true,
  async execute({ text }, ctx) {
    const ref = parseMessageRef(ctx.channel.metadata);
    if (!claimEvent(ref.eventId)) return { state: "alreadyActed" };
    try {
      return await submitReply(samvaFromEnv(), ref, text);
    } catch (error) {
      // `submitReply` returns for every outcome that recorded an action. A throw recorded
      // nothing, so release the claim and let a retry submit instead of reporting `alreadyActed`.
      releaseEvent(ref.eventId);
      throw error;
    }
  },
});

import { defineTool } from "eve/tools";
import { SamvaApiError } from "samva";
import { z } from "zod";

import { claimEvent, holdForReplyRetry, releaseEvent } from "../lib/claim";
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
    if (!claimEvent(ref.eventId, "reply")) return { state: "alreadyActed" };
    try {
      return await submitReply(samvaFromEnv(), ref, text);
    } catch (error) {
      // A 4xx answer means Samva refused the reply and recorded nothing, so either tool may act
      // next. Anything else (a lost response, a server error) may have recorded it: keep the
      // event for a reply retry, which the reply key makes safe.
      const refused =
        error instanceof SamvaApiError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500;
      if (refused) releaseEvent(ref.eventId);
      else holdForReplyRetry(ref.eventId);
      throw error;
    }
  },
});

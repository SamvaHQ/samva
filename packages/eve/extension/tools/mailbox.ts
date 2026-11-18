import { samvaToolInputs, samvaTools } from "@samva/ai-sdk";
import { defineState } from "eve/context";
import { defineDynamic, defineTool, type ToolContext } from "eve/tools";
import { createClient } from "samva";
import { z } from "zod";

import extension from "../extension.js";

const inbound = z.object({
  eventId: z.string().min(1),
  mailboxId: z.string().min(1),
  messageId: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
});
const claimed = defineState<string | null>("mailbox-action", () => null);

function toolOptions(ctx: ToolContext) {
  return { toolCallId: ctx.callId, messages: [], context: {}, abortSignal: ctx.abortSignal };
}

export default defineDynamic((ctx) => {
  const auth = ctx.session.auth.current;
  const source =
    ctx.channel.metadata.adapterName === "samva" && auth?.authenticator === "samva-webhook"
      ? auth.attributes
      : ctx.channel.metadata;
  const ref = inbound.safeParse(source);
  if (!ref.success || ref.data.mailboxId !== extension.config.mailboxId) return null;
  const { eventId, ...message } = ref.data;
  const tools = samvaTools({
    client: createClient({ apiKey: extension.config.apiKey }),
    eventId,
    message,
  });

  // Eve resolves the tool catalog again on each step. Keep the claim in the session across steps.
  function claim(): boolean {
    let available = false;
    claimed.update((current) => {
      available = current !== eventId;
      return eventId;
    });
    return available;
  }

  return {
    reply_to_customer: defineTool({
      description: "Reply to the customer.",
      inputSchema: samvaToolInputs.reply_to_customer,
      endsTurn: true,
      execute: (input, toolCtx) => {
        if (!claim()) return { status: "already handled" };
        return tools.reply_to_customer.execute(input, toolOptions(toolCtx));
      },
    }),
    leave_for_person: defineTool({
      description: "Leave this message for a person.",
      inputSchema: samvaToolInputs.leave_for_person,
      endsTurn: true,
      execute: (input, toolCtx) => {
        if (!claim()) return { status: "already handled" };
        return tools.leave_for_person.execute(input, toolOptions(toolCtx));
      },
    }),
    get_thread: defineTool({
      description: "Read a mailbox thread.",
      inputSchema: samvaToolInputs.get_thread,
      execute: (input, toolCtx) => tools.get_thread.execute(input, toolOptions(toolCtx)),
    }),
    search_threads: defineTool({
      description: "Search mailbox threads.",
      inputSchema: samvaToolInputs.search_threads,
      execute: (input, toolCtx) => tools.search_threads.execute(input, toolOptions(toolCtx)),
    }),
  };
});

import { samvaToolInputs, samvaTools, type SamvaActionStatus } from "@samva/ai-sdk";
import { defineState } from "eve/context";
import { defineDynamic, defineTool, type DynamicContext, type ToolContext } from "eve/tools";
import { createClient } from "samva";
import { z } from "zod";

import extension from "../extension.js";

const inbound = z.object({
  eventId: z.string().min(1),
  mailboxId: z.string().min(1),
  messageId: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
});
const action = defineState<{ eventId: string; status: SamvaActionStatus } | null>(
  "mailbox-action",
  () => null,
);

function toolOptions(ctx: ToolContext) {
  return { toolCallId: ctx.callId, messages: [], context: {}, abortSignal: ctx.abortSignal };
}

export function mailboxTools(ctx: {
  session: { auth: Pick<DynamicContext["session"]["auth"], "current"> };
  channel: Pick<DynamicContext["channel"], "metadata">;
}) {
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
    // Eve rebuilds the tool catalog between model steps.
    actionState: {
      get: () => {
        const saved = action.get();
        return saved?.eventId === eventId ? saved.status : "open";
      },
      set: (status) => action.update(() => ({ eventId, status })),
    },
  });

  return {
    reply_to_customer: defineTool({
      description: "Reply to the customer.",
      inputSchema: samvaToolInputs.reply_to_customer,
      endsTurn: true,
      execute: (input, toolCtx) => tools.reply_to_customer.execute(input, toolOptions(toolCtx)),
    }),
    leave_for_person: defineTool({
      description: "Leave this message for a person.",
      inputSchema: samvaToolInputs.leave_for_person,
      endsTurn: (output) =>
        typeof output === "object" &&
        output !== null &&
        "status" in output &&
        output.status === "left for a person",
      execute: (input, toolCtx) => tools.leave_for_person.execute(input, toolOptions(toolCtx)),
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
}

export default defineDynamic(mailboxTools);

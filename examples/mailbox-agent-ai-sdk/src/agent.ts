import { samvaTools } from "@samva/ai-sdk";
import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import { MailboxEventStreamError, WhatsAppServiceWindowClosedError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "./message";
import { systemPrompt, userTurn } from "./prompt";

/** The result shapes `samvaTools` returns; the AI SDK types a step's tool output as `unknown`. */
type ReplyResult = Awaited<
  ReturnType<ReturnType<typeof samvaTools>["reply_to_customer"]["execute"]>
>;
type LeaveResult = { readonly reason?: string };

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

/** The model and the business's instructions: everything one turn needs besides Samva. */
export interface AgentConfig {
  readonly model: LanguageModel;
  readonly instructions: string;
}

export interface AgentOptions extends AgentConfig {
  readonly mailboxId: string;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/**
 * Handle one event with one agent turn. The framework runs the loop; the turn ends when the model
 * calls a tool that finishes it, or after a few steps. A turn that calls neither tool sends
 * nothing. Throws if the model call or the Samva request fails.
 */
export const handleEvent = async (
  samva: SamvaClient,
  event: MailboxEvent,
  config: AgentConfig,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (received.channel === "email" && isAutomatedSender(received.fromAddress)) {
    log(`skipped ${received.messageId}: automated sender`);
    return;
  }

  const agent = new ToolLoopAgent({
    model: config.model,
    instructions: systemPrompt(config.instructions),
    // One tool set per event: the reply and leave tools share one claim, and a replayed event
    // recovers the first reply's receipt even when the model drafts different text.
    tools: { ...samvaTools({ client: samva, message: received, eventId: event.id }) },
    stopWhen: [hasToolCall("reply_to_customer", "leave_for_person"), isStepCount(5)],
  });
  const { steps } = await agent.generate({ prompt: userTurn(received) });

  // The AI SDK hands a tool's thrown error to the model as a result, so read it from the steps.
  const failure = steps
    .flatMap((step) => step.content)
    .find((part) => part.type === "tool-error" && part.toolName === "reply_to_customer");
  if (failure?.type === "tool-error") {
    // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
    // replayed old event can find it closed; only an approved template reaches them then.
    if (failure.error instanceof WhatsAppServiceWindowClosedError) {
      log(`skipped ${received.messageId}: WhatsApp service window closed`);
      return;
    }
    throw failure.error;
  }

  const results = steps.flatMap((step) => step.content);
  const reply = results.find(
    (part) => part.type === "tool-result" && part.toolName === "reply_to_customer",
  );
  const sent = reply?.type === "tool-result" ? (reply.output as ReplyResult) : undefined;
  if (sent !== undefined && "receipt" in sent) {
    log(`reply to ${received.messageId}: ${sent.status}, action ${sent.receipt.actionId}`);
    return;
  }
  const leave = results.find(
    (part) => part.type === "tool-result" && part.toolName === "leave_for_person",
  );
  const reason = leave?.type === "tool-result" ? (leave.output as LeaveResult).reason : undefined;
  log(`left ${received.messageId} for a person: ${reason ?? "no tool called"}`);
};

/**
 * Follow one mailbox until the signal aborts. The cursor is saved only after an event is handled,
 * so a crash replays the event and the idempotency key keeps the replay from sending twice.
 */
export const runAgent = async (samva: SamvaClient, options: AgentOptions): Promise<void> => {
  const log = options.log ?? console.log;
  let cursor = await options.store.load();

  while (options.signal?.aborted !== true) {
    try {
      for await (const event of samva.mailboxes.events({
        cursor,
        mailboxIds: [options.mailboxId],
        signal: options.signal,
      })) {
        await handleEvent(samva, event, options, log);
        await options.store.save(event.cursor);
        cursor = event.cursor;
      }
      return;
    } catch (error) {
      if (!(error instanceof MailboxEventStreamError) || error._tag !== "CursorExpiredError") {
        throw error;
      }
      // The retained window passed: start from live events. Mail that arrived in the gap stays
      // unread in the mailbox for a person, or for a catch-up pass over `mailboxes.listThreads`.
      log("cursor expired: resuming from live events");
      await options.store.clear();
      cursor = undefined;
    }
  }
};

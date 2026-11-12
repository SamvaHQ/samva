import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import {
  MailboxEventStreamError,
  MailboxSendConflictError,
  WhatsAppServiceWindowClosedError,
} from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "./message";
import { systemPrompt, userTurn } from "./prompt";
import { mailboxTools } from "./tools";
import type { TurnOutcome } from "./tools";

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

  const outcome: TurnOutcome = {};
  const agent = new ToolLoopAgent({
    model: config.model,
    instructions: systemPrompt(config.instructions),
    tools: mailboxTools(samva, received, event.id, outcome),
    stopWhen: [hasToolCall("reply_to_customer", "leave_for_person"), isStepCount(5)],
  });
  await agent.generate({ prompt: userTurn(received) });

  if (outcome.error !== undefined) {
    // A replayed event drafts again, and the model rarely writes the same text twice. Samva
    // refuses a different body under a key it has seen with `MailboxSendConflictError`, which
    // carries the first reply's receipt: there is nothing left to do for this event. Any other
    // conflict, such as a paused mailbox, recorded no reply and is thrown below.
    if (outcome.error instanceof MailboxSendConflictError) {
      const { receipt } = outcome.error;
      log(`already answered ${received.messageId}: ${receipt.state}, action ${receipt.actionId}`);
      return;
    }
    // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
    // replayed old event can find it closed; only an approved template reaches them then.
    if (outcome.error instanceof WhatsAppServiceWindowClosedError) {
      log(`skipped ${received.messageId}: WhatsApp service window closed`);
      return;
    }
    throw outcome.error;
  }
  if (outcome.reply !== undefined) {
    log(`reply to ${received.messageId}: ${outcome.reply.state}, action ${outcome.reply.actionId}`);
    return;
  }
  log(`left ${received.messageId} for a person: ${outcome.leftForPerson ?? "no tool called"}`);
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

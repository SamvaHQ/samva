import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "./message";
import { systemPrompt, userTurn } from "./prompt";
import { messageTools } from "./tools";

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AgentOptions {
  readonly mailboxId: string;
  readonly model: BaseChatModel;
  readonly instructions: string;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/** A message needs one model turn and one tool call; the limit stops a model that keeps looping. */
const RECURSION_LIMIT = 8;

/**
 * Handle one event with one agent run. If the agent finishes without calling a tool, nothing is
 * sent. Throws if the model call or the Samva request fails.
 */
export const handleEvent = async (
  samva: SamvaClient,
  event: MailboxEvent,
  agent: Pick<AgentOptions, "model" | "instructions">,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (received.channel === "email" && isAutomatedSender(received.fromAddress)) {
    log(`skipped ${received.messageId}: automated sender`);
    return;
  }

  const { tools, outcome } = messageTools(samva, received, event.id, log);
  const runner = createAgent({
    model: agent.model,
    tools,
    systemPrompt: systemPrompt(agent.instructions),
  });
  await runner.invoke(
    { messages: [{ role: "user", content: userTurn(received) }] },
    { recursionLimit: RECURSION_LIMIT },
  );

  const result = outcome();
  if (result.kind === "failed") throw result.error;
  if (result.kind === "none") log(`left ${received.messageId} for a person: no tool called`);
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

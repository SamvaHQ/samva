import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "./message";
import { createMailboxTools } from "./tools";
import type { AgentTurn } from "./turn";

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AgentOptions {
  readonly mailboxId: string;
  readonly turn: AgentTurn;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/** Handle one event: run one agent turn. Throws if the turn or the Samva request fails. */
export const handleEvent = async (
  samva: SamvaClient,
  event: MailboxEvent,
  turn: AgentTurn,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (received.channel === "email" && isAutomatedSender(received.fromAddress)) {
    log(`skipped ${received.messageId}: automated sender`);
    return;
  }

  const tools = createMailboxTools(samva, received, event.id);
  await turn(received, tools);

  // A request the agent could not recover from stops the event, so the cursor is not saved.
  const failure = tools.failure();
  if (failure !== undefined) throw failure;

  const outcome = tools.outcome();
  switch (outcome?.kind) {
    case "replied":
      log(`reply to ${received.messageId}: ${outcome.state}, action ${outcome.actionId}`);
      return;
    case "already-answered":
      log(`already answered ${received.messageId}: ${outcome.state}, action ${outcome.actionId}`);
      return;
    case "window-closed":
      log(`skipped ${received.messageId}: WhatsApp service window closed`);
      return;
    case "left":
      log(`left ${received.messageId} for a person: ${outcome.reason}`);
      return;
    case undefined:
      log(`left ${received.messageId} for a person: the agent chose no action`);
      return;
  }
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
        await handleEvent(samva, event, options.turn, log);
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

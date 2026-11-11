import { MailboxEventStreamError, WhatsAppServiceWindowClosedError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import type { Drafter } from "./draft";
import { isAutomatedSender, parseReceivedMessage } from "./message";

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AgentOptions {
  readonly mailboxId: string;
  readonly draft: Drafter;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/** Handle one event: draft a reply and submit it. Throws if drafting or the request fails. */
export const handleEvent = async (
  samva: SamvaClient,
  event: MailboxEvent,
  draft: Drafter,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (received.channel === "email" && isAutomatedSender(received.fromAddress)) {
    log(`skipped ${received.messageId}: automated sender`);
    return;
  }

  const text = await draft(received);
  if (text === undefined) {
    log(`left ${received.messageId} for a person`);
    return;
  }

  // One call answers both channels. The mailbox's decision rules decide whether the reply waits
  // for a person; this example expects a rule that holds every send (see the README).
  const reply =
    received.channel === "whatsapp"
      ? {
          id: received.mailboxId,
          messageId: received.messageId,
          channel: "whatsapp" as const,
          text,
        }
      : { id: received.mailboxId, messageId: received.messageId, text };

  try {
    // The event id is stable across redelivery, so a retry returns the original receipt.
    const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${event.id}` });
    log(`reply to ${received.messageId}: ${receipt.state}, action ${receipt.actionId}`);
  } catch (error) {
    // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
    // replayed old event can find it closed; only an approved template reaches them then.
    if (!(error instanceof WhatsAppServiceWindowClosedError)) throw error;
    log(`skipped ${received.messageId}: WhatsApp service window closed`);
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
        await handleEvent(samva, event, options.draft, log);
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

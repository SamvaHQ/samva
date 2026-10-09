import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, MailboxEventStreamOptions } from "samva";

import { composeReply, parseReceivedMessage } from "./reply";

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

/** The slice of `createClient(...)` the agent uses, so tests can supply a fake. */
export interface MailboxAgentClient {
  readonly mailboxes: {
    events(options?: MailboxEventStreamOptions): AsyncIterable<MailboxEvent>;
    reply(params: {
      id: string;
      messageId: string;
      text: string;
      "idempotency-key": string;
    }): Promise<{ status: "sent" | "pending_approval"; actionId: string }>;
    listThreads(params: {
      id: string;
      unread: "true";
      limit: string;
    }): Promise<{ items: ReadonlyArray<{ id: string }> }>;
  };
}

export interface MailboxAgentOptions {
  readonly mailboxId: string;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/** Handle one event. Returns after the reply request settles; throws if it fails. */
export const handleEvent = async (
  client: MailboxAgentClient,
  event: MailboxEvent,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);

  const text = composeReply(received);
  if (text === undefined) {
    log(`skipped ${received.messageId}: nothing to say`);
    return;
  }

  // The event id is stable across redelivery, so a retry returns the original receipt.
  const receipt = await client.mailboxes.reply({
    id: received.mailboxId,
    messageId: received.messageId,
    text,
    "idempotency-key": `reply:${event.id}`,
  });

  if (receipt.status === "pending_approval") {
    log(`reply to ${received.messageId} waits for approval: action ${receipt.actionId}`);
  } else {
    log(`reply to ${received.messageId} sent: action ${receipt.actionId}`);
  }
};

/**
 * Follow one mailbox until the signal aborts or an unrecoverable error ends the stream.
 *
 * The cursor is saved only after an event is handled, so a crash replays the event; the
 * idempotency key on the reply makes that replay safe.
 */
export const runMailboxAgent = async (
  client: MailboxAgentClient,
  options: MailboxAgentOptions,
): Promise<void> => {
  const log = options.log ?? console.log;
  let cursor = await options.store.load();

  while (options.signal?.aborted !== true) {
    try {
      for await (const event of client.mailboxes.events({
        cursor,
        mailboxIds: [options.mailboxId],
        signal: options.signal,
      })) {
        await handleEvent(client, event, log);
        await options.store.save(event.cursor);
        cursor = event.cursor;
      }
      return;
    } catch (error) {
      if (!(error instanceof MailboxEventStreamError) || error._tag !== "CursorExpiredError") {
        throw error;
      }
      // The retained window passed. Read current state, then start without a cursor.
      const unread = await client.mailboxes.listThreads({
        id: options.mailboxId,
        unread: "true",
        limit: "20",
      });
      log(`cursor expired: ${unread.items.length} unread threads need review; restarting`);
      await options.store.clear();
      cursor = undefined;
    }
  }
};

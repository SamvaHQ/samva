import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "../agent/lib/message";
import type { RelayBody } from "../agent/lib/message";

/** Where the relay keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

/** Hands one message to the Eve agent. Resolves once Eve has accepted it. */
export type Forward = (body: RelayBody) => Promise<void>;

export interface RelayOptions {
  readonly mailboxId: string;
  readonly forward: Forward;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

type FetchLike = (url: URL, init: RequestInit) => Promise<Response>;

/** Post to the Eve channel route. A non-2xx answer throws, so the event is retried. */
export const httpForward =
  (baseUrl: string, token: string, fetchImpl: FetchLike = fetch): Forward =>
  async (body) => {
    const response = await fetchImpl(new URL("/samva/messages", baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Eve refused event ${body.eventId}: HTTP ${String(response.status)}`);
    }
  };

/** Forward one received message; skip everything else. Throws if Eve does not accept it. */
export const handleEvent = async (
  event: MailboxEvent,
  forward: Forward,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const message = parseReceivedMessage(event.data);
  if (message === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (message.channel === "email" && isAutomatedSender(message.fromAddress)) {
    log(`skipped ${message.messageId}: automated sender`);
    return;
  }
  await forward({ eventId: event.id, message });
  log(`forwarded ${message.messageId} (event ${event.id})`);
};

/**
 * Follow one mailbox until the signal aborts. The cursor is saved only after Eve accepts an
 * event, so a crash replays it; Eve ignores the replay because the event id keys the send.
 */
export const runRelay = async (samva: SamvaClient, options: RelayOptions): Promise<void> => {
  const log = options.log ?? console.log;
  let cursor = await options.store.load();

  while (options.signal?.aborted !== true) {
    try {
      for await (const event of samva.mailboxes.events({
        cursor,
        mailboxIds: [options.mailboxId],
        signal: options.signal,
      })) {
        await handleEvent(event, options.forward, log);
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

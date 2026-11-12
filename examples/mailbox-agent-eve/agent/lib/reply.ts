import { MailboxSendConflictError, WhatsAppServiceWindowClosedError, createClient } from "samva";
import type { SamvaClient } from "samva";

import type { MessageRef } from "./message";

/** Read at call time, so a missing key fails the tool call and not the build. */
export const samvaFromEnv = (): SamvaClient => {
  const apiKey = process.env.SAMVA_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error("Missing required env var SAMVA_API_KEY");
  }
  return createClient({ apiKey });
};

export interface ReplyResult {
  /** The receipt state, or `alreadyAnswered` / `windowClosed` when nothing new was submitted. */
  readonly state: string;
  readonly actionId?: string;
}

/**
 * Submit the model's text as the reply to the message in `ref`. One call answers both channels;
 * the mailbox's decision rules decide whether the reply waits for a person (see the README).
 */
export const submitReply = async (
  samva: SamvaClient,
  ref: MessageRef,
  text: string,
): Promise<ReplyResult> => {
  const reply =
    ref.channel === "whatsapp"
      ? { id: ref.mailboxId, messageId: ref.messageId, channel: "whatsapp" as const, text }
      : { id: ref.mailboxId, messageId: ref.messageId, text };
  try {
    // The event id is stable across redelivery, so a retry returns the original receipt.
    const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${ref.eventId}` });
    return { state: receipt.state, actionId: receipt.actionId };
  } catch (error) {
    // A replayed event drafts again, and the model rarely writes the same text twice. Samva
    // refuses a different body under a key it has seen with `MailboxSendConflictError`, which
    // carries the first reply's receipt. Any other conflict, such as a paused mailbox, recorded
    // no reply and is thrown below.
    if (error instanceof MailboxSendConflictError) {
      return { state: "alreadyAnswered", actionId: error.receipt.actionId };
    }
    // Free-form WhatsApp text needs the 24-hour service window a customer's message opens. A
    // replayed old event can find it closed; only an approved template reaches them then.
    if (error instanceof WhatsAppServiceWindowClosedError) return { state: "windowClosed" };
    throw error;
  }
};

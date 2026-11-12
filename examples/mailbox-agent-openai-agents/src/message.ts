/** The fields of a `mailbox.message.received` event the agent relies on. */
export interface ReceivedMessage {
  readonly mailboxId: string;
  readonly messageId: string;
  /** `whatsapp` when the message arrived on the mailbox's WhatsApp number. */
  readonly channel: "email" | "whatsapp";
  /** The sender's email address, or their number in E.164 form on WhatsApp. */
  readonly fromAddress: string;
  readonly subject: string | null;
  readonly text: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Event `data` is `unknown` to the stream client, so validate before use. Returns `undefined`
 * for a payload that is not a received message.
 */
export const parseReceivedMessage = (data: unknown): ReceivedMessage | undefined => {
  if (!isRecord(data) || typeof data.mailboxId !== "string") return undefined;
  const message = data.message;
  if (!isRecord(message) || typeof message.id !== "string") return undefined;
  const from = message.from;
  if (!isRecord(from) || typeof from.address !== "string") return undefined;
  return {
    mailboxId: data.mailboxId,
    messageId: message.id,
    channel: message.channel === "whatsapp" ? "whatsapp" : "email",
    fromAddress: from.address,
    subject: typeof message.subject === "string" ? message.subject : null,
    text: typeof message.text === "string" ? message.text : null,
  };
};

const AUTOMATED_SENDER = /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster)@/i;

/** Replying to an automated sender starts a mail loop, so the agent never drafts for one. */
export const isAutomatedSender = (address: string): boolean => AUTOMATED_SENDER.test(address);

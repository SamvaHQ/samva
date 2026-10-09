/** The fields of a `mailbox.message.received` event the agent relies on. */
export interface ReceivedMessage {
  readonly mailboxId: string;
  readonly messageId: string;
  readonly fromAddress: string;
  readonly subject: string | null;
  readonly text: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Event `data` is `unknown` to the stream client, so validate before use. Returns `undefined`
 * for a payload that is not a received message; the caller decides whether that is an error.
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
    fromAddress: from.address,
    subject: typeof message.subject === "string" ? message.subject : null,
    text: typeof message.text === "string" ? message.text : null,
  };
};

const AUTOMATED_SENDER = /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster)@/i;

/** Replying to an automated sender starts a mail loop. */
export const isAutomatedSender = (address: string): boolean => AUTOMATED_SENDER.test(address);

/**
 * The agent's decision, kept deterministic so the example stays about mailbox mechanics.
 * Replace it with your own logic; return `undefined` to leave the message alone.
 */
export const composeReply = (message: ReceivedMessage): string | undefined => {
  if (isAutomatedSender(message.fromAddress)) return undefined;
  const topic = message.subject ?? "your message";
  return `Thanks for writing about "${topic}". A person will follow up shortly.`;
};

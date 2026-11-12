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

/** The customer's message is data inside tags; the instructions say never to follow it. */
export const userTurn = (message: ReceivedMessage): string =>
  [
    `<customer_message channel="${message.channel}">`,
    ...(message.subject === null ? [] : [`Subject: ${message.subject}`]),
    message.text ?? "",
    "</customer_message>",
  ].join("\n");

/** What the relay posts to the Eve channel for one event. */
export interface RelayBody {
  readonly eventId: string;
  readonly message: ReceivedMessage;
}

export const parseRelayBody = (body: unknown): RelayBody | undefined => {
  if (!isRecord(body) || typeof body.eventId !== "string" || body.eventId === "") return undefined;
  const message = body.message;
  if (!isRecord(message)) return undefined;
  const { mailboxId, messageId, channel, fromAddress, subject, text } = message;
  if (typeof mailboxId !== "string" || typeof messageId !== "string") return undefined;
  if (channel !== "email" && channel !== "whatsapp") return undefined;
  if (typeof fromAddress !== "string") return undefined;
  if (subject !== null && typeof subject !== "string") return undefined;
  if (text !== null && typeof text !== "string") return undefined;
  return {
    eventId: body.eventId,
    message: { mailboxId, messageId, channel, fromAddress, subject, text },
  };
};

/**
 * The ids a tool needs, kept in the Eve channel's state. Tools read them from
 * `ctx.channel.metadata`, so the model never supplies or sees them.
 */
export interface MessageRef {
  readonly eventId: string;
  readonly mailboxId: string;
  readonly messageId: string;
  readonly channel: "email" | "whatsapp";
}

/** `ctx.channel.metadata` is `Record<string, unknown>`, so validate before use. */
export const parseMessageRef = (metadata: unknown): MessageRef => {
  if (
    isRecord(metadata) &&
    typeof metadata.eventId === "string" &&
    typeof metadata.mailboxId === "string" &&
    typeof metadata.messageId === "string" &&
    metadata.eventId !== "" &&
    metadata.mailboxId !== "" &&
    metadata.messageId !== "" &&
    (metadata.channel === "email" || metadata.channel === "whatsapp")
  ) {
    return {
      eventId: metadata.eventId,
      mailboxId: metadata.mailboxId,
      messageId: metadata.messageId,
      channel: metadata.channel,
    };
  }
  throw new Error("This session was not started by the samva channel: no message to answer.");
};

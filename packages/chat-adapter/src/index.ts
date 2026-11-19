import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { cardToFallbackText } from "@chat-adapter/shared";
import { isKnownEvent, verifyRequest, type SamvaWebhookEvent } from "@samva/webhooks";
import {
  isCardElement,
  Message,
  NotImplementedError,
  stringifyMarkdown,
  type Adapter,
  type AdapterPostableMessage,
  type ChatInstance,
  type FetchOptions,
  type FormattedContent,
  type RawMessage,
  type StreamChunk,
  type StreamOptions,
  type WebhookOptions,
} from "chat";
import { createClient, MailboxSendConflictError, type SamvaClient } from "samva";

/**
 * A credential, or a function that returns one. The adapter calls the function each time it needs
 * the value and does not cache it, so rotating or short-lived credentials take effect at once.
 */
export type SamvaCredential = string | (() => string | Promise<string>);

export interface SamvaAdapterOptions {
  /** Mailbox-scoped API key. A function is called before every API request. */
  readonly apiKey: SamvaCredential;
  readonly mailboxId: string;
  /** Webhook signing secret. A function is called for every delivery. */
  readonly webhookSecret: SamvaCredential;
  readonly userName?: string;
  /** Dispatch automated email to Chat SDK handlers when explicitly enabled. */
  readonly includeAutomatedEmail?: boolean;
}

type Mailboxes = SamvaClient["mailboxes"];
export type SamvaSendReceipt = Awaited<ReturnType<Mailboxes["reply"]>>;
type MailboxMessage = Awaited<ReturnType<Mailboxes["getMessage"]>>;
type MessageSummary = Awaited<ReturnType<Mailboxes["listThreadMessages"]>>["items"][number];
type Received = Extract<SamvaWebhookEvent, { type: "mailbox.message.received" }>;

export interface SamvaInboundEvent {
  readonly eventId: string;
  readonly data: Received["data"];
}

export type SamvaRawMessage = SamvaInboundEvent | MailboxMessage | SamvaSendReceipt;
type ThreadTarget = { threadId: string } | { recipient: string };
type DeliveryContext = SamvaInboundEvent & { nextPost: number };

export function receiptOf(message: {
  readonly raw: SamvaRawMessage;
}): SamvaSendReceipt | undefined {
  return "actionId" in message.raw ? message.raw : undefined;
}

function messageText(message: AdapterPostableMessage): string {
  if (typeof message === "string") return message;
  if (isCardElement(message)) return cardToFallbackText(message);
  if (
    ("files" in message && message.files?.length) ||
    ("attachments" in message && message.attachments?.length)
  ) {
    throw new NotImplementedError(
      "Samva Chat SDK posts support text and card fallback text.",
      "attachments",
    );
  }
  if ("card" in message) return message.fallbackText ?? cardToFallbackText(message.card);
  if ("raw" in message) return message.raw;
  if ("markdown" in message) return message.markdown;
  return stringifyMarkdown(message.ast);
}

const AUTOMATED_LOCAL_PART =
  /(^|[._+-])(?:no[._-]?reply|do[._-]?not[._-]?reply|mailer-daemon|postmaster|bounces?)(?=$|[._+-])/i;

/** Largest `text` a webhook carries; a body at this length may have been cut. */
const WEBHOOK_TEXT_LIMIT = 32_000;

function isPreviewTruncated(message: Received["data"]["message"]): boolean {
  return (
    (message.text?.length ?? 0) >= WEBHOOK_TEXT_LIMIT ||
    (message.replyText?.length ?? 0) >= WEBHOOK_TEXT_LIMIT
  );
}

function isAutomatedEmail(message: Received["data"]["message"]): boolean {
  const address = message.from.address.trim();
  const at = address.lastIndexOf("@");
  if (at > 0 && AUTOMATED_LOCAL_PART.test(address.slice(0, at))) return true;

  // Samva webhooks can omit headers. Inspect them when present in the signed payload.
  const headers = message.headers;
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) return false;
  return Object.entries(headers).some(([name, raw]) => {
    const values = Array.isArray(raw) ? raw : [raw];
    return values.some((value) => {
      if (typeof value !== "string") return false;
      const token = value.split(";", 1)[0]?.trim().toLowerCase();
      switch (name.toLowerCase()) {
        case "auto-submitted":
          return !!token && token !== "no";
        case "precedence":
          return token === "bulk" || token === "list" || token === "junk";
        default:
          return false;
      }
    });
  });
}

async function resolveCredential(credential: SamvaCredential, name: string): Promise<string> {
  const value = typeof credential === "string" ? credential : await credential();
  if (!value.trim())
    throw new Error(`Samva adapter credential resolver returned an empty ${name}.`);
  return value;
}

function isBlank(credential: SamvaCredential): boolean {
  return typeof credential === "string" && !credential.trim();
}

function createMailboxClient(apiKey: SamvaCredential): SamvaClient {
  if (typeof apiKey === "string") return createClient({ apiKey });
  return createClient({
    // The SDK sets X-API-Key from this value; the fetch below replaces it on every request.
    apiKey: "resolved-per-request",
    // The SDK only calls fetch; runtime extras such as Bun's `fetch.preconnect` are unused.
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      request.headers.set("X-API-Key", await resolveCredential(apiKey, "API key"));
      return globalThis.fetch(request);
    }) as typeof fetch,
  });
}

function unsupported(): never {
  throw new NotImplementedError("Samva messages do not support edits, deletion, or reactions.");
}

export class SamvaAdapter implements Adapter<ThreadTarget, SamvaRawMessage> {
  readonly name = "samva";
  readonly lockScope = "thread";
  readonly userName: string;
  private readonly client: SamvaClient;
  private readonly mailboxId: string;
  private readonly webhookSecret: SamvaCredential;
  private readonly includeAutomatedEmail: boolean;
  private readonly inbound = new AsyncLocalStorage<DeliveryContext>();
  private chat?: ChatInstance;

  constructor({
    apiKey,
    mailboxId,
    webhookSecret,
    userName = "Samva",
    includeAutomatedEmail = false,
  }: SamvaAdapterOptions) {
    if (isBlank(apiKey) || !mailboxId.trim() || mailboxId.includes(":") || isBlank(webhookSecret)) {
      throw new Error("Samva adapter requires an API key, mailbox ID, and webhook secret.");
    }
    this.client = createMailboxClient(apiKey);
    this.mailboxId = mailboxId;
    this.webhookSecret = webhookSecret;
    this.userName = userName;
    this.includeAutomatedEmail = includeAutomatedEmail;
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
  }

  private get prefix(): string {
    return `samva:${this.mailboxId}:`;
  }

  encodeThreadId(target: ThreadTarget): string {
    if ("recipient" in target) return `${this.prefix}dm:${encodeURIComponent(target.recipient)}`;
    if (!target.threadId || target.threadId.includes(":"))
      throw new Error("Invalid Samva thread ID.");
    return this.prefix + target.threadId;
  }

  decodeThreadId(id: string): ThreadTarget {
    if (!id.startsWith(this.prefix))
      throw new Error("Thread ID belongs to another adapter or mailbox.");
    const suffix = id.slice(this.prefix.length);
    if (suffix.startsWith("dm:")) {
      const recipient = decodeURIComponent(suffix.slice(3));
      if (/^\+[1-9]\d{1,14}$/.test(recipient) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        return { recipient };
      }
      throw new Error("Use an email address or E.164 number to open a Samva conversation.");
    }
    if (!suffix || suffix.includes(":")) throw new Error("Invalid Samva thread ID.");
    return { threadId: suffix };
  }

  channelIdFromThreadId(threadId: string): string {
    this.decodeThreadId(threadId);
    return threadId;
  }

  isDM(id: string): boolean {
    const target = this.decodeThreadId(id);
    if ("recipient" in target) return target.recipient.startsWith("+");
    const active = this.inbound.getStore()?.data.message;
    return active?.threadId === target.threadId && active.channel === "whatsapp";
  }

  getChannelVisibility(): "private" {
    return "private";
  }

  async openDM(userId: string): Promise<string> {
    const id = this.encodeThreadId({ recipient: userId });
    this.decodeThreadId(id);
    return id;
  }

  async handleWebhook(request: Request, options?: WebhookOptions): Promise<Response> {
    // A resolver failure is not a bad signature: let it throw so the delivery is retried.
    const secret = await resolveCredential(this.webhookSecret, "webhook secret");
    const delivery = await verifyRequest(request, secret).catch(() => undefined);
    if (!delivery) return new Response("Invalid webhook", { status: 401 });

    const { id, event } = delivery;
    if (
      !isKnownEvent(event) ||
      event.type !== "mailbox.message.received" ||
      event.data.mailboxId !== this.mailboxId ||
      event.data.message.channel === "sms"
    ) {
      return new Response(null, { status: 204 });
    }
    const inbound = event.data.message;
    if (
      !this.includeAutomatedEmail &&
      (inbound.channel ?? "email") === "email" &&
      isAutomatedEmail(inbound)
    ) {
      return new Response(null, { status: 204 });
    }
    const chat = this.chat;
    if (!chat) throw new Error("Initialize the Samva adapter with Chat before handling webhooks.");
    const raw = { eventId: id, data: event.data };
    const message = this.parseMessage(raw);
    const state = chat.getState();
    const key = `${this.prefix}webhook:${id}`;
    // Covers the verifier's acceptance window, including signatures dated ahead of the server.
    if (await state.setIfNotExists(key, true, 24 * 60 * 60 * 1000)) {
      const { waitUntil, ...messageOptions } = options ?? {};
      // Read before returning so a failure reaches the sender as an error and the webhook is retried.
      let turn = message;
      try {
        if (isPreviewTruncated(inbound)) turn = await this.fullMessage(raw, inbound.id);
      } catch (error) {
        await state.delete(key);
        throw error;
      }
      const task = this.inbound.run({ ...raw, nextPost: 0 }, async () => {
        try {
          await state.delete(this.historyKey(message.threadId));
          await chat.processMessage(this, message.threadId, turn, {
            ...messageOptions,
            deduplicate: false,
          });
        } catch (error) {
          await state.delete(key);
          throw error;
        }
      });
      if (waitUntil) waitUntil(task);
      else await task;
    }
    return new Response(null, { status: 204 });
  }

  /** The webhook preview is capped, so a long message is read in full from the mailbox. */
  private async fullMessage(
    raw: SamvaInboundEvent,
    messageId: string,
  ): Promise<Message<SamvaRawMessage>> {
    const full = await this.client.mailboxes.getMessage({ id: this.mailboxId, messageId });
    return this.parseMessage(raw, full);
  }

  parseMessage(raw: SamvaRawMessage, content?: MailboxMessage): Message<SamvaRawMessage> {
    if ("actionId" in raw) throw new Error("A send receipt does not contain a message body.");
    const message = "data" in raw ? raw.data.message : raw;
    const source = content ?? message;
    const isMe = "direction" in message && message.direction === "outbound";
    const body = ("replyText" in source ? source.replyText : undefined) ?? source.text ?? "";
    const email = (message.channel ?? "email") === "email";
    const subject = email && "subject" in source ? source.subject?.trim() : undefined;
    const text = subject ? `Subject: ${subject}${body.trim() ? `\n\n${body}` : ""}` : body;
    const { address } = message.from;
    const name = "data" in raw ? raw.data.message.from.name : raw.from.displayName;
    return new Message({
      id: message.id,
      threadId: this.encodeThreadId({ threadId: message.threadId }),
      raw,
      text,
      formatted: {
        type: "root",
        children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
      },
      author: {
        userId: address,
        userName: address,
        fullName: name ?? address,
        ...(email ? { email: address } : {}),
        isBot: isMe ? true : "unknown",
        isMe,
      },
      isMention: "eventId" in raw,
      metadata: { dateSent: new Date(message.occurredAt), edited: false },
      attachments: [],
    });
  }

  async fetchThread(id: string) {
    const target = this.decodeThreadId(id);
    if ("recipient" in target) {
      return { id, channelId: id, isDM: this.isDM(id), metadata: {} };
    }
    const thread = await this.client.mailboxes.getThread({ id: this.mailboxId, ...target });
    return {
      id,
      channelId: id,
      isDM: thread.channel === "whatsapp",
      metadata: { subject: thread.subject, channel: thread.channel },
    };
  }

  async fetchMessages(id: string, options: FetchOptions = {}) {
    const target = this.decodeThreadId(id);
    if ("recipient" in target) return { messages: [] };
    const limit = options.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("Samva history page size must be between 1 and 100.");
    }
    const mailboxThread = { id: this.mailboxId, ...target };
    if (options.direction === "forward") {
      const page = await this.client.mailboxes.getThreadContent({
        ...mailboxThread,
        limit,
        cursor: options.cursor,
      });
      return {
        messages: page.items.map((item) => this.parseMessage(item)),
        ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor }),
      };
    }

    const ids = await this.historyIds(id, target.threadId);
    const end = options.cursor === undefined ? ids.length : ids.indexOf(options.cursor);
    if (end < 0) throw new Error("Samva history cursor is missing from this thread.");
    const start = Math.max(0, end - limit);
    const messages = await Promise.all(
      ids.slice(start, end).map(async (messageId) => {
        const raw = await this.client.mailboxes.getMessage({ id: this.mailboxId, messageId });
        if (raw.threadId !== target.threadId) {
          throw new Error("Message does not belong to this Samva thread.");
        }
        return this.parseMessage(raw);
      }),
    );
    return { messages, ...(start > 0 && messages[0] ? { nextCursor: messages[0].id } : {}) };
  }

  private historyKey(id: string): string {
    return `${id}:history-ids`;
  }

  private async historyIds(id: string, threadId: string): Promise<string[]> {
    const state = this.chat?.getState();
    const key = this.historyKey(id);
    const cached = await state?.get<string[]>(key);
    if (cached) return cached;

    // The API pages oldest to newest. Index the summaries once so backward
    // pages fetch bodies for the requested window without rereading the thread.
    const ids: string[] = [];
    for await (const page of this.messagePages(threadId)) {
      for (const message of page) ids.push(message.id);
    }
    await state?.set(key, ids, 30_000);
    return ids;
  }

  private async *messagePages(threadId: string): AsyncGenerator<MessageSummary[]> {
    let cursor: string | undefined;
    do {
      // oxlint-disable-next-line no-await-in-loop -- The next request needs this page's cursor.
      const page = await this.client.mailboxes.listThreadMessages({
        id: this.mailboxId,
        threadId,
        cursor,
        limit: 100,
      });
      yield page.items;
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }

  async postMessage(
    id: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<SamvaRawMessage>> {
    const target = this.decodeThreadId(id);
    const text = messageText(message);
    if (!text.trim()) throw new Error("Samva posts require message text.");
    if ("recipient" in target) {
      const { recipient } = target;
      const receipt = await this.client.mailboxes.sendMessage(
        recipient.startsWith("+")
          ? { id: this.mailboxId, channel: "whatsapp", to: recipient, text }
          : { id: this.mailboxId, to: [recipient], subject: "New message", text },
      );
      return this.posted(id, receipt);
    }

    const active = this.inbound.getStore();
    if (active?.data.message.threadId === target.threadId) {
      // Replaying the delivery starts at the same ordinal even if the draft changes.
      const position = active.nextPost++;
      const eventDigest = createHash("sha256").update(active.eventId).digest("hex");
      const key = `reply:${active.data.message.id}:delivery:${eventDigest}:${position}`;
      try {
        return await this.replyTo(id, active.data.message, text, key);
      } catch (error) {
        if (error instanceof MailboxSendConflictError) return this.posted(id, error.receipt);
        throw error;
      }
    }
    let latest: MessageSummary | undefined;
    for await (const page of this.messagePages(target.threadId)) {
      latest = page.findLast((item) => item.direction === "inbound") ?? latest;
    }
    if (!latest) throw new Error("Samva thread has no inbound message to reply to.");
    const digest = createHash("sha256").update(text).digest("hex");
    return this.replyTo(id, latest, text, `reply:${latest.id}:${digest}`);
  }

  private async replyTo(
    id: string,
    target: { id: string; channel?: MessageSummary["channel"] },
    text: string,
    idempotencyKey: string,
  ) {
    const input = { id: this.mailboxId, messageId: target.id, text };
    if (target.channel === "sms")
      throw new NotImplementedError("Samva Chat SDK supports email and WhatsApp.");
    const receipt = await this.client.mailboxes.reply(
      target.channel === "whatsapp" ? { ...input, channel: target.channel } : input,
      { idempotencyKey },
    );
    await this.chat?.getState().delete(this.historyKey(id));
    return this.posted(id, receipt);
  }

  private posted(threadId: string, receipt: SamvaSendReceipt): RawMessage<SamvaRawMessage> {
    if (receipt.state === "notSent" || receipt.state === "uncertain") {
      throw new Error(`Samva send action ${receipt.actionId} ended in state ${receipt.state}.`);
    }
    return {
      id:
        receipt.state === "approvalRequired"
          ? receipt.actionId
          : (receipt.messageId ?? receipt.actionId),
      threadId: receipt.threadId ? this.encodeThreadId({ threadId: receipt.threadId }) : threadId,
      raw: receipt,
    };
  }

  async stream(
    threadId: string,
    chunks: AsyncIterable<string | StreamChunk>,
    options?: StreamOptions,
  ) {
    const parts: string[] = [];
    options?.signal?.throwIfAborted();
    for await (const chunk of chunks) {
      options?.signal?.throwIfAborted();
      if (typeof chunk === "string") parts.push(chunk);
      else if (chunk.type === "markdown_text") parts.push(chunk.text);
    }
    options?.signal?.throwIfAborted();
    const text = parts.join("");
    if (text.trim() === "") throw new Error("Samva streams require message text.");
    return this.postMessage(threadId, text);
  }

  renderFormatted(content: FormattedContent): string {
    return stringifyMarkdown(content);
  }

  async startTyping(): Promise<void> {}
  async editMessage(): Promise<never> {
    unsupported();
  }
  async deleteMessage(): Promise<never> {
    unsupported();
  }
  async addReaction(): Promise<never> {
    unsupported();
  }
  async removeReaction(): Promise<never> {
    unsupported();
  }
}

export function createSamvaAdapter(options: SamvaAdapterOptions): SamvaAdapter {
  return new SamvaAdapter(options);
}

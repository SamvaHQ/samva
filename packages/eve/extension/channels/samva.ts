import { createSamvaAdapter } from "@samva/chat-adapter";
import type { Message, Thread } from "chat";
import { defineChannel } from "eve/channels";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { z } from "zod";

import extension from "../extension.js";

const eventRef = z.object({
  eventId: z.string().min(1),
  data: z.object({
    mailboxId: z.string(),
    message: z.object({
      id: z.string(),
      channel: z.enum(["email", "whatsapp"]).default("email"),
    }),
  }),
});

function mailboxChannel() {
  const { apiKey, mailboxId, webhook } = extension.config;
  if (!webhook) return defineChannel({ routes: [] });

  const samva = createSamvaAdapter({ apiKey, mailboxId, webhookSecret: webhook.secret });
  const { bot, channel, send } = chatSdkChannel({
    userName: samva.userName,
    adapters: { samva },
    state: webhook.state,
    streaming: false,
    concurrency: "concurrent",
    webhook: { propagateHandlerErrors: true },
    events: {
      // Customer-visible text is submitted by the bound reply tool.
      "content.completed": () => {},
      "interaction.opened": () => {},
      committed: () => {},
      "turn.settled": () => {},
      "session.ended": () => {},
    },
  });

  async function deliver(thread: Thread, message: Message) {
    const parsed = eventRef.safeParse(message.raw);
    if (!parsed.success) return;
    const { eventId, data } = parsed.data;
    await send(message.text, {
      thread,
      turnPolicy: "queue",
      idempotencyKey: eventId,
      auth: {
        authenticator: "samva-webhook",
        principalType: "customer",
        principalId: thread.id,
        attributes: {
          eventId,
          mailboxId: data.mailboxId,
          messageId: data.message.id,
          channel: data.message.channel,
        },
      },
    });
  }

  bot.onNewMention(deliver);
  bot.onSubscribedMessage(deliver);
  bot.onDirectMessage(deliver);
  return channel;
}

export default mailboxChannel();

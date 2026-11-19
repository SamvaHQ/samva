import { createMemoryState } from "@chat-adapter/state-memory";
import { createSamvaAdapter, receiptOf } from "@samva/chat-adapter";
import { Chat, type Message, type Thread } from "chat";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

export const samva = createSamvaAdapter({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhookSecret: required("SAMVA_WEBHOOK_SECRET"),
});

export const chat = new Chat({
  userName: "Support",
  adapters: { samva },
  state: createMemoryState(),
  concurrency: "concurrent",
});

async function acknowledge(thread: Thread, message: Message) {
  if (message.author.isMe) return;
  const posted = await samva.postMessage(thread.id, "Thanks for your message.");
  const receipt = receiptOf(posted);
  if (receipt?.state === "approvalRequired") {
    console.info("Reply held for approval", receipt.actionId);
  }
}

chat.onNewMention(acknowledge);
chat.onSubscribedMessage(acknowledge);
chat.onDirectMessage(acknowledge);

import { Agent } from "@openai/agents";
import type { Model, Runner } from "@openai/agents";
import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";

import { isAutomatedSender, parseReceivedMessage } from "./message";
import { systemPrompt, userTurn } from "./prompt";
import { mailboxTools } from "./tools";

/** The model the agent runs on unless `AgentConfig.model` replaces it. */
export const DEFAULT_MODEL = "gpt-5.6-sol";

/** Where the agent keeps its place in the event stream. Use durable storage in production. */
export interface CursorStore {
  load(): Promise<string | undefined>;
  save(cursor: string): Promise<void>;
  clear(): Promise<void>;
}

/** What the framework needs to run one turn per message. */
export interface AgentConfig {
  readonly runner: Runner;
  /** What the business wants, from the operator. It goes in the system prompt. */
  readonly instructions: string;
  /** A model name the runner resolves, or a `Model` instance. Tests pass a fake. */
  readonly model?: string | Model;
}

export interface AgentOptions {
  readonly mailboxId: string;
  readonly config: AgentConfig;
  readonly store: CursorStore;
  readonly log?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/**
 * Handle one event: run one agent turn on the message. The agent finishes by calling a tool; if it
 * calls neither, nothing is sent. Throws if the model or the Samva request fails.
 */
export const handleEvent = async (
  samva: SamvaClient,
  event: MailboxEvent,
  config: AgentConfig,
  log: (line: string) => void,
): Promise<void> => {
  if (event.type !== "mailbox.message.received") return;

  const received = parseReceivedMessage(event.data);
  if (received === undefined) throw new Error(`Malformed ${event.type} event ${event.id}`);
  if (received.channel === "email" && isAutomatedSender(received.fromAddress)) {
    log(`skipped ${received.messageId}: automated sender`);
    return;
  }

  const agent = new Agent({
    name: "Mailbox agent",
    instructions: systemPrompt(config.instructions),
    model: config.model ?? DEFAULT_MODEL,
    modelSettings: { reasoning: { effort: "low" }, parallelToolCalls: false },
    tools: mailboxTools(samva, received, event.id, log),
    // The tool's result is the end of the turn, so the model is not called again to summarize it.
    toolUseBehavior: "stop_on_first_tool",
  });

  const result = await config.runner.run(agent, userTurn(received), { maxTurns: 2 });
  if (!result.newItems.some((item) => item.type === "tool_call_item")) {
    log(`left ${received.messageId} for a person: the agent called no tool`);
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
        await handleEvent(samva, event, options.config, log);
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

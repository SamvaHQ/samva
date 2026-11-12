# Give a Vercel AI SDK agent an email inbox with Samva

Give a [Vercel AI SDK](https://ai-sdk.dev) agent its own email address. A Samva mailbox has an
event stream the agent reads incoming messages from, and the agent replies through the same API.
The mailbox's rules can hold each reply until a person approves it.

The runnable example lives in [`examples/mailbox-agent-ai-sdk`](../examples/mailbox-agent-ai-sdk).
Its tests use a mocked Samva transport and the AI SDK's mock model, so they run without an
account or a model key. For the mailbox itself, see the [mailboxes cookbook](./mailboxes.md).

## What you build

A program that follows one mailbox and runs one agent turn per incoming message. The framework
runs the tool loop. Samva's actions are two tools: one submits a reply to the current message, and
one leaves the message for a person. If the agent finishes without calling either, nothing is
sent.

## Install

```sh
bun add ai @ai-sdk/anthropic samva zod
```

The example uses `ai@^7.0.170`, `@ai-sdk/anthropic@^4.0.102`, and `samva@^0.43.0`. Create a
mailbox and a restricted key as shown in the [mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key),
and give the agent only that key.

## The two tools

Both tools close over the message and the event id, so the model supplies only the reply text or a
reason. It cannot choose the recipient, channel, or thread.

```ts
import { tool } from "ai";
import type { SamvaClient } from "samva";
import { z } from "zod";

import type { ReceivedMessage } from "./message";

export interface TurnOutcome {
  reply?: { readonly state: string; readonly actionId: string };
  error?: unknown;
  leftForPerson?: string;
}

export const mailboxTools = (
  samva: SamvaClient,
  message: ReceivedMessage,
  eventId: string,
  outcome: TurnOutcome,
) => ({
  reply_to_customer: tool({
    description:
      "Submit a reply to the customer's message. It is held for a person's approval before it is sent.",
    inputSchema: z.object({ text: z.string().trim().min(1).describe("The plain-text reply.") }),
    execute: async ({ text }) => {
      const reply =
        message.channel === "whatsapp"
          ? {
              id: message.mailboxId,
              messageId: message.messageId,
              channel: "whatsapp" as const,
              text,
            }
          : { id: message.mailboxId, messageId: message.messageId, text };
      try {
        const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
        outcome.reply = { state: receipt.state, actionId: receipt.actionId };
        return `Reply submitted (${receipt.state}).`;
      } catch (error) {
        outcome.error = error;
        return "The reply could not be submitted. Do not try again.";
      }
    },
  }),

  leave_for_person: tool({
    description: "Leave this message for a person to answer. Nothing is sent.",
    inputSchema: z.object({ reason: z.string().trim().min(1).describe("One short sentence.") }),
    execute: async ({ reason }) => {
      outcome.leftForPerson = reason;
      return "Left for a person.";
    },
  }),
});
```

The AI SDK turns an error thrown inside a tool into a result the model sees, so the reply tool
records the error in `outcome` and the caller decides what to do with it. Events are delivered at
least once, and the reply is keyed by the event id, so a replayed event cannot send twice.

## Run one turn per message

`samva.mailboxes.events` is an async iterable of `mailbox.*` events. For each received message,
build a `ToolLoopAgent` with the tools for that event and call `generate`. `stopWhen` ends the turn
as soon as either tool is called, and after five steps at most.

```ts
import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";

const outcome: TurnOutcome = {};
const agent = new ToolLoopAgent({
  model: config.model,
  instructions: systemPrompt(config.instructions),
  tools: mailboxTools(samva, received, event.id, outcome),
  stopWhen: [hasToolCall("reply_to_customer", "leave_for_person"), isStepCount(5)],
});
await agent.generate({ prompt: userTurn(received) });
```

The customer's message is untrusted data. `userTurn` wraps it in `<customer_message>` tags, and the
system prompt tells the model to answer it and never to follow instructions inside it. Choose the
model in one line, and any AI SDK provider can replace it:

```ts
import { anthropic } from "@ai-sdk/anthropic";

const model = anthropic("claude-opus-5-5");
```

## The approval rule

Give the agent a mailbox-scoped key whose policy is
`{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
`state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
with `samva login`. An API key can never approve a send, so a message that talks the model into a
bad reply still waits for a person. The mailboxes cookbook shows how to
[set the policy](./mailboxes.md#create-a-mailbox-and-a-scoped-key) and how a person
[approves or denies](./mailboxes.md#reply-and-the-approval-flow) a held reply.

## WhatsApp from the same mailbox

Add a number your organization has connected as an endpoint on the mailbox, and a WhatsApp message
arrives as the same event. The reply tool above answers it with `channel: "whatsapp"`. See
[Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox).
WhatsApp needs a paid plan.

## Example

See the runnable [`mailbox-agent-ai-sdk` example](../examples/mailbox-agent-ai-sdk) for the full
event loop with cursor persistence and cursor-expiry recovery, and the tests.

```sh
bun --cwd examples/mailbox-agent-ai-sdk run typecheck
bun --cwd examples/mailbox-agent-ai-sdk run test
```

# Give a LangGraph agent an email inbox with Samva

Give a LangGraph agent its own email address. A Samva mailbox has an event stream. Your program
follows it, runs the agent once per incoming message, and the agent answers through two tools. The
mailbox's rules hold every reply until a person approves it.

The runnable example lives in
[`examples/mailbox-agent-langgraph`](../examples/mailbox-agent-langgraph). The tests use a fake
chat model and a mocked HTTP transport, so the whole flow runs without an account or a model key.

## What you build

- One tool that replies to the current message through `samva.mailboxes.reply`.
- One tool that leaves the message for a person and sends nothing.
- A loop that follows `samva.mailboxes.events` for one mailbox and runs one agent per message.

Both tools close over the event. The model supplies only the reply text or a reason, so it cannot
choose the recipient, channel, or thread.

## Install

```sh
bun add samva langchain @langchain/core @langchain/anthropic zod
```

These examples use `samva@^0.43.0`, `langchain@^1.6.5`, `@langchain/core@^1.4.0`, and
`@langchain/anthropic@^1.6.4`. `createAgent` comes from `langchain`; it replaces the older
`createReactAgent` in `@langchain/langgraph/prebuilt`.

Create the mailbox, a mailbox-scoped key, and its policy as described in the
[mailboxes cookbook](./mailboxes.md).

## The two tools

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const reply_to_customer = tool(
  async ({ text }) => {
    const reply =
      received.channel === "whatsapp"
        ? {
            id: received.mailboxId,
            messageId: received.messageId,
            channel: "whatsapp" as const,
            text,
          }
        : { id: received.mailboxId, messageId: received.messageId, text };
    const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
    return `Submitted. The reply is ${receipt.state}.`;
  },
  {
    name: "reply_to_customer",
    description:
      "Reply to the customer's message with plain text. The reply is held for a person's approval.",
    schema: z.object({ text: z.string().trim().min(1).describe("The reply text to send.") }),
    returnDirect: true,
  },
);

const leave_for_person = tool(
  async ({ reason }) => {
    log(`left ${received.messageId} for a person: ${reason}`);
    return "Left for a person. Nothing was sent.";
  },
  {
    name: "leave_for_person",
    description:
      "Send nothing and leave the message for a person. Use when the instructions do not cover it.",
    schema: z.object({ reason: z.string().describe("One short sentence on why.") }),
    returnDirect: true,
  },
);
```

`returnDirect: true` ends the run after either tool, so the model is not called again. The example
builds these inside `messageTools` in `src/tools.ts`, which also claims the message before its
first `await` so a second call in the same run is refused, and handles the errors Samva can return
for a replayed event. Keying the reply by
the event id means a replayed event cannot send twice.

## Run one invocation per message

```ts
import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";

const model = new ChatAnthropic({ model: "claude-opus-5-5" });

for await (const event of samva.mailboxes.events({ mailboxIds: [mailboxId] })) {
  if (event.type !== "mailbox.message.received") continue;
  const received = parseReceivedMessage(event.data);
  if (received === undefined) continue;

  const { tools } = messageTools(samva, received, event.id, console.log);
  const agent = createAgent({ model, tools, systemPrompt: systemPrompt(instructions) });
  await agent.invoke(
    { messages: [{ role: "user", content: userTurn(received) }] },
    { recursionLimit: 8 },
  );
}
```

`recursionLimit` stops a model that keeps looping. If the agent finishes without calling either
tool, nothing is sent. The customer's message goes in the user turn inside `<customer_message>`
tags, and the system prompt tells the model that it is untrusted data and never to follow
instructions found there. `parseReceivedMessage` validates the event's `unknown` data; see
`src/message.ts`.

## The approval rule

Give the agent a mailbox-scoped key whose policy is
`{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
`state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
with `samva login` in the CLI. An API key can never approve a send. A message that talks the
model into a bad reply still waits for a person.

## WhatsApp from the same mailbox

A customer's WhatsApp message arrives as the same `mailbox.message.received` event, and the
`reply_to_customer` tool answers it by adding `channel: "whatsapp"` to the same
`mailboxes.reply` call. Add a number your organization has connected as an endpoint on the
mailbox ([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Example

See the runnable [`mailbox-agent-langgraph` example](../examples/mailbox-agent-langgraph) for the
event loop with cursor-expiry recovery, the automated-sender check, and its tests.

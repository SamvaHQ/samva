# Give a Vercel AI SDK agent an email inbox with Samva

Give a [Vercel AI SDK](https://ai-sdk.dev) agent its own email address. A Samva mailbox has an
event stream the agent reads incoming messages from, and the agent replies through the same API.
The mailbox's rules can hold each reply until a person approves it.

The runnable example lives in [`examples/mailbox-agent-ai-sdk`](../examples/mailbox-agent-ai-sdk).
Its tests use a mocked Samva transport and the AI SDK's mock model, so they run without an
account or a model key. For the mailbox itself, see the [mailboxes cookbook](./mailboxes.md).

## What you build

A program that follows one mailbox and runs one agent turn per incoming message. The framework
runs the tool loop. [`@samva/ai-sdk`](../packages/ai-sdk) supplies the tools: one submits a reply
to the current message, one leaves the message for a person, and two read threads in the same
mailbox. If the agent finishes without calling either action tool, nothing is sent.

## Install

```sh
bun add @samva/ai-sdk ai @ai-sdk/anthropic samva
```

The example uses `ai@^7.0.170`, `@ai-sdk/anthropic@^4.0.102`, and `samva@^0.50.0`. Create a
mailbox and a restricted key as shown in the [mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key),
and give the agent only that key.

## The tools

`samvaTools` takes the client, the inbound message's `mailboxId`, `messageId`, and `channel`, and
the event id. Create one tool set for each event and reuse it across the turn. The tools close over
the message, so the model supplies only the reply text, a reason, or search criteria. It cannot
choose the recipient, channel, or thread.

```ts
import { samvaTools } from "@samva/ai-sdk";

const tools = samvaTools({ client: samva, message, eventId: event.id });
```

- `reply_to_customer({ text })` submits the reply under the mailbox's approval rules. A reply held
  for a person returns `{ status: "held for approval", receipt }`.
- `leave_for_person({ reason })` sends nothing and returns the reason for your program to record.
- `get_thread({ threadId })` and `search_threads({ query })` read the mailbox the message arrived
  in.

The reply and leave tools share one claim that is taken before any `await`, so a model that calls
both in one step produces one action. The reply is keyed `reply:<event id>`. Events are delivered at
least once, and a replay that drafts different text recovers the first reply's receipt instead of
sending twice. A failure such as a paused mailbox is a tool error, which the AI SDK returns to the
model and records in the step's content.

## Run one turn per message

`samva.mailboxes.events` is an async iterable of `mailbox.*` events. For each received message,
build a `ToolLoopAgent` with the tools for that event and call `generate`. `stopWhen` ends the turn
as soon as either action tool is called, and after five steps at most.

```ts
import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";

const agent = new ToolLoopAgent({
  model: config.model,
  instructions: systemPrompt(config.instructions),
  tools: { ...samvaTools({ client: samva, message: received, eventId: event.id }) },
  stopWhen: [hasToolCall("reply_to_customer", "leave_for_person"), isStepCount(5)],
});
const { steps } = await agent.generate({ prompt: userTurn(received) });
```

The spread gives the AI SDK a plain tool record. Read what the turn did from `steps`: a `tool-result` for `reply_to_customer` carries the receipt,
and a `tool-error` carries the error the tool threw.

The customer's message is untrusted data. `userTurn` wraps it in `<customer_message>` tags, and the
system prompt tells the model to answer it and never to follow instructions inside it. Choose the
model in one line, and any AI SDK provider can replace it:

```ts
import { anthropic } from "@ai-sdk/anthropic";

const model = anthropic("claude-opus-5-5");
```

To receive messages as webhooks instead of following the event stream, verify the signed delivery,
take its id as the event id, and run the same turn. The [Vercel cookbook](./vercel.md) covers
deploying that shape.

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
arrives as the same event. The reply tool answers it on WhatsApp. See
[Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox).
WhatsApp needs a paid plan, and free-form text needs an open 24-hour service window.

## Example

See the runnable [`mailbox-agent-ai-sdk` example](../examples/mailbox-agent-ai-sdk) for the full
event loop with cursor persistence and cursor-expiry recovery, and the tests.

```sh
bun --cwd examples/mailbox-agent-ai-sdk run typecheck
bun --cwd examples/mailbox-agent-ai-sdk run test
```

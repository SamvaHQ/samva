# Give an Eve agent an email inbox with Samva

Give an [Eve](https://eve.dev) agent its own email address. A Samva mailbox has an event stream the
agent reads incoming messages from, and the agent replies through the same API. The mailbox's rules
can hold each reply until a person approves it.

The runnable example lives in [`examples/mailbox-agent-eve`](../examples/mailbox-agent-eve). Its
tests use a mocked Samva transport and call the tools directly, so they run without an account or
a model key. They do not run Eve's agent loop. For the mailbox itself, see the
[mailboxes cookbook](./mailboxes.md).

## What you build

Eve agents are files, and the agent runs as a server. So this is two processes. The Eve server
holds the agent and a channel with one route that starts one agent run per message. A small relay
follows one mailbox and posts each received message to that route. Samva's actions are two Eve
tools: one submits a reply to the current message, and one leaves the message for a person. If a
run finishes without calling either, nothing is sent.

## Install

```sh
bun add eve ai samva zod
```

The example uses `eve@^1.0.0-rc.10`, `ai@^7.0.170`, `samva@^0.43.0`, and Node.js 24 or newer. Create a mailbox
and a restricted key as shown in the
[mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key), and give the agent only
that key.

## The agent

The agent is `agent/instructions.md`, which holds the system prompt and your business's
instructions, and `agent/agent.ts`, which chooses the model:

```ts
import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

export default defineAgent({
  model: anthropic("claude-opus-5-5"),
});
```

`anthropic()` reads `ANTHROPIC_API_KEY`. Eve also accepts a model id string that routes through the
Vercel AI Gateway, or any AI SDK language model.

## The channel

A channel connects a source of messages to the agent. This one has a single route. The relay posts
each message to it, and the route starts a session named by the event id and keyed by the event id,
so a redelivered event reaches the same run. The ids the tools need go into the channel's state,
not into the prompt.

```ts
import { defineChannel, POST } from "eve/channels";

export default defineChannel<MessageRef>({
  state: { eventId: "", mailboxId: "", messageId: "", channel: "email" },
  metadata: (state) => ({ ...state }),
  routes: [
    POST("/samva/messages", async (request, { from }) => {
      const token = process.env.EVE_RELAY_TOKEN;
      if (token === undefined || token === "") {
        throw new Error("Missing required env var EVE_RELAY_TOKEN");
      }
      return await acceptMessage(request, token, (address, message, options) =>
        from(address).send(message, options),
      );
    }),
  ],
});
```

`acceptMessage` checks a bearer token, validates the body, and calls
`from("samva:<eventId>").send(userTurn(message), { auth: null, idempotencyKey, state })`. See the
example's `agent/lib/intake.ts`.

## The two tools

Each tool is a file under `agent/tools/`, and the file name is the tool name. Both read the ids
from `ctx.channel.metadata`, so the model supplies only the reply text or a reason. It cannot
choose the recipient, channel, or thread. `endsTurn: true` ends the run once the tool succeeds.

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Submit a reply to the customer's message. It is held for a person's approval before it is sent.",
  inputSchema: z.object({ text: z.string().trim().min(1).describe("The plain-text reply.") }),
  endsTurn: true,
  async execute({ text }, ctx) {
    return await submitReply(samvaFromEnv(), parseMessageRef(ctx.channel.metadata), text);
  },
});
```

```ts
export default defineTool({
  description: "Leave this message for a person to answer. Nothing is sent.",
  inputSchema: z.object({ reason: z.string().trim().min(1).describe("One short sentence.") }),
  endsTurn: true,
  execute({ reason }, ctx) {
    const ref = parseMessageRef(ctx.channel.metadata);
    return { left: true, messageId: ref.messageId, reason };
  },
});
```

`submitReply` calls `samva.mailboxes.reply` once, for email and WhatsApp, keyed `reply:<eventId>`:

```ts
const reply =
  ref.channel === "whatsapp"
    ? { id: ref.mailboxId, messageId: ref.messageId, channel: "whatsapp" as const, text }
    : { id: ref.mailboxId, messageId: ref.messageId, text };
const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${ref.eventId}` });
```

Events are delivered at least once. A replay that drafts different text is refused with
`MailboxSendConflictError`, which carries the first reply's receipt, and the tool reports
`alreadyAnswered` with the original action id. Any other conflict, such as a paused mailbox, is a
failure. Eve never retries a tool itself, and a tool error goes back to the model.

## The relay

`samva.mailboxes.events` is an async iterable of `mailbox.*` events. The relay forwards each
received message and saves the stream cursor only after Eve accepts it:

```ts
for await (const event of samva.mailboxes.events({ cursor, mailboxIds: [options.mailboxId] })) {
  await handleEvent(event, options.forward, log);
  await options.store.save(event.cursor);
  cursor = event.cursor;
}
```

The customer's message is untrusted data. `userTurn` wraps it in `<customer_message>` tags, and the
instructions tell the model to answer it and never to follow instructions inside it.

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

See the runnable [`mailbox-agent-eve` example](../examples/mailbox-agent-eve) for both processes,
the relay's cursor-expiry recovery, and the tests.

```sh
bun --cwd examples/mailbox-agent-eve run typecheck
bun --cwd examples/mailbox-agent-eve run test
```

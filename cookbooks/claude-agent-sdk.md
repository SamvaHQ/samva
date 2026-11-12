# Give a Claude Agent SDK agent an email inbox with Samva

Give a Claude Agent SDK agent its own email address. The agent follows a Samva mailbox, runs one
turn per incoming message, and answers by calling a tool. The tool submits the reply through
Samva, where the mailbox's rules hold it until a person approves it.

The runnable example lives in
[`examples/mailbox-agent-claude-agent-sdk`](../examples/mailbox-agent-claude-agent-sdk). Its tests
use fakes, so the whole flow runs without an account or a model call. Mailbox setup, scoped keys,
and the approval flow are in the [mailboxes cookbook](./mailboxes.md). Full reference:
<https://samva.dev/docs/mailboxes>.

## What you build

- A loop over `samva.mailboxes.events` for one mailbox.
- One `query()` per received message, with the built-in tools removed so the agent can only call
  the two tools below.
- `reply_to_message`, which calls `samva.mailboxes.reply`, and `leave_for_person`, which sends
  nothing.

## Install

```sh
bun add samva @anthropic-ai/claude-agent-sdk zod
```

The example uses `samva@^0.43.0` and `@anthropic-ai/claude-agent-sdk@^0.3.322`.

## The two tools

Both tools close over the incoming message, so the model supplies only the reply text. It cannot
choose the recipient, the channel, or the thread. The reply is keyed by the event id, so a replayed
event cannot send twice.

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const replyTool = (run: (replyText: string) => Promise<ReturnType<typeof text>>) =>
  tool(
    "reply_to_message",
    "Send your reply to the customer's message. A person at the business approves it before it is sent. Call this once.",
    { text: z.string().min(1).describe("The reply, in plain text.") },
    async (args) => run(args.text),
    { annotations: { destructiveHint: true, openWorldHint: true }, alwaysLoad: true },
  );

const leaveTool = (run: (reason: string) => ReturnType<typeof text>) =>
  tool(
    "leave_for_person",
    "Send nothing and leave this message for a person to handle. Use it when the business instructions do not cover the question or the message is not a customer asking for help.",
    { reason: z.string().min(1).describe("One short sentence for the person.") },
    async (args) => run(args.reason),
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );
```

The reply handler passed to `replyTool` is the one call to Samva:

```ts
const reply =
  message.channel === "whatsapp"
    ? {
        id: message.mailboxId,
        messageId: message.messageId,
        channel: "whatsapp" as const,
        text: replyText,
      }
    : { id: message.mailboxId, messageId: message.messageId, text: replyText };
const receipt = await samva.mailboxes.reply(reply, { idempotencyKey: `reply:${eventId}` });
```

In `src/tools.ts` both handlers claim the message before their first `await`, so a second call,
even an overlapping one, is refused. The reply handler treats a `MailboxSendConflictError`, which Samva
sends when a replayed event drafts different text, as "already answered" and logs the first reply's
receipt, so a replayed event ends cleanly. Any other conflict, such as a paused mailbox, is a
failure.

## Run one turn per message

`createSdkMcpServer` serves the tools in your process. `tools: []` removes every built-in tool
(files, shell, web), and `allowedTools` pre-approves the two tool names, which follow
`mcp__<server>__<tool>`.

```ts
import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";

const server = createSdkMcpServer({
  name: "mailbox",
  tools: [tools.replyToMessage, tools.leaveForPerson],
});

for await (const event of query({
  prompt: userTurn(message),
  options: {
    model: "claude-opus-5-5",
    systemPrompt: systemPrompt(instructions),
    tools: [],
    mcpServers: { mailbox: server },
    allowedTools: ["mcp__mailbox__reply_to_message", "mcp__mailbox__leave_for_person"],
    maxTurns: 4,
    settingSources: [],
    persistSession: false,
  },
})) {
  if (event.type === "result" && (event.subtype !== "success" || event.is_error)) {
    throw new Error(`Agent turn for ${message.messageId} failed: ${event.subtype}`);
  }
}
```

The customer's message goes in the user turn inside `<customer_message>` tags, and the system
prompt tells the agent it is untrusted data and never to follow instructions found there. If the
agent finishes without calling either tool, the agent sends nothing. Save the event's `cursor`
after the turn so a restart resumes from the next event.

## The approval rule

The agent uses a mailbox-scoped key with a `write` minimum of `person`:

```ts
rules: [{ match: { effect: "write" }, atLeast: "person" }];
```

A reply then returns `state: "approvalRequired"`, and nothing is sent until a person approves it in
the dashboard or with `samva login`. An API key can never approve a send. A message that talks the
agent into a bad reply still waits for a person. Create the mailbox, key, and policy as shown in the
[mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key).

## WhatsApp from the same mailbox

A customer's WhatsApp message arrives as the same `mailbox.message.received` event, and the same
reply tool answers it with `channel: "whatsapp"`, so the agent needs no second integration. Add a
number your organization has connected as an endpoint on the mailbox
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Example

See [`examples/mailbox-agent-claude-agent-sdk`](../examples/mailbox-agent-claude-agent-sdk) for the
event loop, the tools, and the tests. Run it with:

```sh
bun --cwd examples/mailbox-agent-claude-agent-sdk run test
```

# Give an OpenAI Agents SDK agent an email inbox with Samva

Give an agent built with the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) its
own email address. A Samva mailbox holds the threads, an event stream delivers each new message,
and the agent answers through two tools. The mailbox's rules hold every reply until a person
approves it.

The runnable example lives in
[`examples/mailbox-agent-openai-agents`](../examples/mailbox-agent-openai-agents). Its tests use a
scripted model and a mocked HTTP transport, so they run without an account or an API key. Setting
up the mailbox, a mailbox-scoped key, and its approval rule is covered in the
[mailboxes cookbook](./mailboxes.md); full reference: <https://samva.dev/docs/mailboxes>.

## What you build

An agent that follows one mailbox and runs one agent turn per incoming message. In that turn the
agent either submits a reply or leaves the message for a person. It sends nothing if it calls
neither tool.

## Install

```sh
bun add @openai/agents samva zod
```

The example uses `@openai/agents@^0.21.0` and `samva@^0.43.0`.

## The two tools

Both tools are built for one message, so the model supplies only the words. It cannot choose the
recipient, the channel, or the thread.

```ts
import { tool } from "@openai/agents";
import { z } from "zod";

const replyToCustomer = tool({
  name: "reply_to_customer",
  description:
    "Submit a reply to the customer's message. A person at the business approves it before it is sent.",
  parameters: z.object({ text: z.string().min(1).describe("The plain-text reply.") }),
  // A failed request stops the turn instead of going back to the model as text.
  errorFunction: null,
  execute: async ({ text }) => {
    const receipt = await samva.mailboxes.reply(
      { id: received.mailboxId, messageId: received.messageId, text },
      { idempotencyKey: `reply:${eventId}` },
    );
    return `Submitted: ${receipt.state}.`;
  },
});

const leaveForPerson = tool({
  name: "leave_for_person",
  description:
    "Send nothing and leave this message for a person. Use it when the business instructions do not cover the question or the message is not a customer asking for help.",
  parameters: z.object({
    reason: z.string().min(1).describe("One short sentence for the person."),
  }),
  execute: async ({ reason }) => {
    log(`left ${received.messageId} for a person: ${reason}`);
    return "Left for a person.";
  },
});
```

`samva`, `received`, `eventId`, and `log` come from the function that builds the tools for each
message (`mailboxTools` in `src/tools.ts`). The reply is keyed by the event id: events are
delivered at least once, and a retry with the same key returns the original receipt. The example's
tool also catches `ConflictError` and `WhatsAppServiceWindowClosedError` for replayed events.

## Run one turn per message

```ts
import { Agent, Runner } from "@openai/agents";

const runner = new Runner({ traceIncludeSensitiveData: false });

for await (const event of samva.mailboxes.events({ cursor, mailboxIds: [mailboxId] })) {
  if (event.type === "mailbox.message.received") {
    const received = parseReceivedMessage(event.data);
    if (received === undefined) throw new Error(`Malformed event ${event.id}`);

    const agent = new Agent({
      name: "Mailbox agent",
      instructions: systemPrompt(instructions),
      model: "gpt-5.6-sol",
      modelSettings: { reasoning: { effort: "low" }, parallelToolCalls: false },
      tools: mailboxTools(samva, received, event.id, log),
      // The tool's result is the end of the turn, so the model is not called again to summarize it.
      toolUseBehavior: "stop_on_first_tool",
    });

    await runner.run(agent, userTurn(received), { maxTurns: 2 });
  }
  await saveCursor(event.cursor);
}
```

The customer's message goes to the model inside `<customer_message>` tags, and the system prompt
says it is untrusted data to answer, never to obey. `parseReceivedMessage` validates the event
`data`, which is `unknown`. The SDK sends traces to OpenAI by default; `traceIncludeSensitiveData:
false` keeps the message text out of them, and `tracingDisabled: true` sends none.

## The approval rule

Give the agent a mailbox-scoped key whose policy is
`{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
`state: "approvalRequired"` and nothing is sent until a person approves it in the dashboard or with
`samva login`. An API key can never approve a send. A message that talks the model into a bad
reply still waits for a person.

## WhatsApp from the same mailbox

A WhatsApp message arrives on the same event stream, and the same `mailboxes.reply` call answers it
with `channel: "whatsapp"`. The example's reply tool sets that field from the incoming message. To
receive WhatsApp in the mailbox, add a number your organization has connected as an endpoint on it,
as described in
[Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox).
WhatsApp needs a paid plan.

## Test without a model

The SDK ships a scripted model. Pass it as `model`, turn tracing off on the `Runner`, and the run
makes no request to OpenAI:

```ts
import { Runner } from "@openai/agents";
import { ScriptedModel, functionCall } from "@openai/agents/testing";

const model = new ScriptedModel([
  [functionCall("reply_to_customer", { text: "It ships today." }, { callId: "call_1" })],
]);
const runner = new Runner({ tracingDisabled: true });
```

## Example

See the runnable [`mailbox-agent-openai-agents` example](../examples/mailbox-agent-openai-agents)
for the full event loop with cursor persistence and cursor-expiry recovery.

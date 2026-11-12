# Mailbox agent with LangGraph + Samva

A runnable TypeScript agent that answers customers from a Samva mailbox, on email and WhatsApp.
It follows the mailbox event stream and runs a [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview)
agent once per message. The agent acts through two tools, and the mailbox's rules hold every
reply until a person approves it.

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox and runs one agent, built with
  `createAgent` from `langchain`, per `mailbox.message.received` event. A WhatsApp message arrives
  as the same event and is answered by the same call with `channel: "whatsapp"`.
- `src/tools.ts` defines the two tools: `reply_to_customer` submits the reply through
  `samva.mailboxes.reply`, and `leave_for_person` sends nothing. Both close over the event, so the
  model supplies only the reply text or a reason. It cannot choose the recipient, channel, or
  thread.
- `src/prompt.ts` holds the system prompt and the user turn.

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth
(cursor recovery, the webhook extension form) with a fixed reply instead of a model, and
[`mailbox-agent-claude`](../mailbox-agent-claude) does the same job with a single model call
instead of an agent loop.

## Safety stance

- **A person approves every send.** Give the agent a mailbox-scoped key whose policy is
  `{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
  `state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
  with `samva login` in the CLI. An API key can never approve a send. See the
  [mailboxes cookbook](../../cookbooks/mailboxes.md).
- **Mail is untrusted data.** The customer's message goes to the model inside
  `<customer_message>` tags in the user turn, and the system prompt tells the model never to
  follow instructions found there. The approval rule is what makes that safe to rely on: a
  message that talks the model into a bad reply still waits for a person.
- **The model can decline.** It calls `leave_for_person` when the instructions do not cover the
  question, and the agent sends nothing. A run that ends without calling either tool is treated
  the same way.
- **One decision per message.** The agent run has a recursion limit, and a second tool call in
  the same run is refused before it awaits anything, so one event produces at most one reply.
  Both tools set `returnDirect: true`, so the run ends after the chosen tool without another
  model call.
- **Idempotent replies.** Each reply is keyed by the event id, so a replayed event cannot send
  twice.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use the Samva client with a mocked HTTP transport and a fake chat model that emits tool
calls. They turn LangSmith tracing off and fail on any other network call, so they never contact
Samva, Anthropic, or LangSmith.

## Run the agent

```sh
SAMVA_API_KEY=samva_sk_test_... \
SAMVA_MAILBOX_ID=mbx_... \
ANTHROPIC_API_KEY=sk-ant-... \
AGENT_INSTRUCTIONS="We sell handmade candles. Orders ship within two business days. Refunds are decided by a person." \
bun run agent
```

Send the mailbox an email, then approve or deny the held reply in the dashboard. The example
keeps its stream cursor in memory, so a restart resumes from live events; persist it in
production. LangChain sends traces, including message text, to LangSmith when you set
`LANGSMITH_TRACING=true`; leave it unset unless you want that.

To answer WhatsApp from the same mailbox, add a number your organization has connected as an
endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Change the model

`src/main.ts` passes `new ChatAnthropic({ model: "claude-opus-5-5" })` from `@langchain/anthropic`.
`runAgent` takes any LangChain chat model that supports tool calling, so replace it with another
provider's model.

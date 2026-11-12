# Mailbox agent with the Claude Agent SDK + Samva

A runnable TypeScript agent that answers customers from a Samva mailbox, on email and WhatsApp.
It follows the mailbox event stream and runs one
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) turn per message. The
agent acts through two tools: one submits a reply through Samva, where the mailbox's rules hold it
until a person approves it, and one leaves the message for a person.

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox and runs a turn for each
  received message. A WhatsApp message arrives as the same event and is answered by the same
  tool with `channel: "whatsapp"`.
- `src/tools.ts` defines the tools with the SDK's `tool()`. `reply_to_message` calls
  `samva.mailboxes.reply`; `leave_for_person` sends nothing. Both close over the event, so the
  model supplies only the reply text and cannot choose the recipient, channel, or thread.
- `src/turn.ts` is the agent loop: one `query()` per message with the built-in tools removed
  (`tools: []`), the two tools served from an in-process MCP server, and `claude-opus-5-5`.

The [`mailbox-agent-claude`](../mailbox-agent-claude) example does the same job with a direct
model call and no agent loop. The [`mailbox-agent`](../mailbox-agent) example covers the mailbox
mechanics in more depth (cursor recovery, the webhook extension form) with a fixed reply instead
of a model.

## Safety stance

- **A person approves every send.** Give the agent a mailbox-scoped key whose policy is
  `{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
  `state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
  with `samva login` in the CLI. An API key can never approve a send. See the
  [mailboxes cookbook](../../cookbooks/mailboxes.md).
- **Mail is untrusted data.** The customer's message goes to the agent inside
  `<customer_message>` tags in the user turn, and the system prompt tells it never to follow
  instructions found there. The agent has no file, shell, or web tools, so the only thing a
  message can talk it into is a reply, and the approval rule holds that for a person.
- **The agent can decline.** It calls `leave_for_person` when the instructions do not cover the
  question. If a turn ends without calling either tool, the agent sends nothing.
- **Idempotent replies.** Each reply is keyed by the event id, so a replayed event cannot send
  twice. A second call to the reply tool in the same turn is refused.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use the Samva client with a mocked HTTP transport. The model is replaced by a function
that calls the tools directly, and the `query()` wiring is checked with the SDK's `query` mocked.
They never contact Samva or Anthropic.

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
production.

To answer WhatsApp from the same mailbox, add a number your organization has connected as an
endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Change the model

`src/turn.ts` sets `model: "claude-opus-5-5"`. `AgentTurn` is one function from a message and its
tools to a finished turn; replace `claudeTurn` with any other implementation that calls the tools.

# Mailbox agent with the Vercel AI SDK + Samva

A runnable TypeScript agent that answers customers from a Samva mailbox, on email and WhatsApp.
It follows the mailbox event stream and runs one [Vercel AI SDK](https://ai-sdk.dev) agent turn
per message. The framework runs the loop; Samva's actions are the tools the agent calls, and the
mailbox's rules hold each reply until a person approves it.

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox and runs one `ToolLoopAgent`
  turn per `mailbox.message.received` event. A WhatsApp message arrives as the same event and is
  answered by the same tool with `channel: "whatsapp"`.
- `src/tools.ts` defines the two tools with `tool()`. `reply_to_customer` submits the reply
  through `samva.mailboxes.reply`. `leave_for_person` records a short reason and sends nothing.
  Both close over the event, so the model supplies only the reply text or the reason. It cannot
  choose the recipient, channel, or thread.
- `src/prompt.ts` holds the system prompt and the user turn.

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth
(cursor recovery, the webhook extension form) with a fixed reply instead of a model. The
[`mailbox-agent-claude`](../mailbox-agent-claude) example does the same job with a direct
Anthropic call instead of a framework loop.

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
  question. If a turn ends without calling either tool, the agent sends nothing.
- **Bounded turns.** A turn stops as soon as the model calls either tool, and after five steps
  at most (`stopWhen` in `src/agent.ts`).
- **Idempotent replies.** Each reply is keyed by the event id, so a replayed event cannot send
  twice. The tools claim the message before their first `await`, so overlapping calls in one
  step produce at most one action.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use the Samva client with a mocked HTTP transport and the AI SDK's own mock language
model (`MockLanguageModelV4` from `ai/test`). They never contact Samva or a model provider.

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

`src/main.ts` passes `anthropic("claude-opus-5-5")` from `@ai-sdk/anthropic`. Any AI SDK provider
can replace the model in that one line: install its package and pass its model instead.
`AgentConfig.model` in `src/agent.ts` is the framework's `LanguageModel` type, so nothing else
changes.

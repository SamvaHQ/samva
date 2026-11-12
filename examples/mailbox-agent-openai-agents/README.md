# Mailbox agent with the OpenAI Agents SDK + Samva

A runnable TypeScript agent that answers customers from a Samva mailbox, on email and WhatsApp.
It follows the mailbox event stream and runs one [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)
agent turn per message. The agent acts through two tools, and a reply goes through Samva, where the
mailbox's rules hold it until a person approves it.

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox and runs one turn per
  `mailbox.message.received` event. A WhatsApp message arrives as the same event and is answered
  by the same call with `channel: "whatsapp"`.
- `src/tools.ts` defines the agent's two tools with the SDK's `tool()`:
  `reply_to_customer` calls `samva.mailboxes.reply`, and `leave_for_person` sends nothing and logs
  a short reason. Both close over the current message, so the model supplies only the reply text
  or the reason and cannot choose the recipient, channel, or thread.
- `src/prompt.ts` builds the system prompt and the user turn.

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth
(cursor recovery, the webhook extension form) with a fixed reply instead of a model, and
[`mailbox-agent-claude`](../mailbox-agent-claude) is the same job with the model call written by
hand instead of an agent framework.

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
  question. If it finishes without calling either tool, the agent sends nothing.
- **One action per message.** The tools claim the message before their first `await`, so two
  tool calls in one turn produce at most one action.
- **The tools fix the target.** The model cannot address a different recipient or thread.
- **Idempotent replies.** Each reply is keyed by the event id, so a replayed event cannot send
  twice.
  A replay that drafts different text is refused with `MailboxSendConflictError`, which carries
  the first reply's receipt; any other conflict, such as a paused mailbox, is a failure.
- **Failures are not hidden from the run.** The reply tool sets `errorFunction: null`, so a failed
  Samva request stops the turn and the event is replayed, instead of going back to the model as
  text.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use the Samva client with a mocked HTTP transport and the SDK's `ScriptedModel` in place
of a model, with tracing turned off on the `Runner`. They never contact Samva or OpenAI.

## Run the agent

```sh
SAMVA_API_KEY=samva_sk_test_... \
SAMVA_MAILBOX_ID=mbx_... \
OPENAI_API_KEY=sk-... \
AGENT_INSTRUCTIONS="We sell handmade candles. Orders ship within two business days. Refunds are decided by a person." \
bun run agent
```

Send the mailbox an email, then approve or deny the held reply in the dashboard. The example
keeps its stream cursor in memory, so a restart resumes from live events; persist it in
production.

The SDK sends traces to OpenAI by default. `src/main.ts` sets `traceIncludeSensitiveData: false`
on the `Runner` so customer text stays out of them; set `tracingDisabled: true` to send none.

To answer WhatsApp from the same mailbox, add a number your organization has connected as an
endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Change the model

`src/agent.ts` runs `DEFAULT_MODEL` (`gpt-5.6-sol`) at low reasoning effort, with at most two
turns per message and `toolUseBehavior: "stop_on_first_tool"`, so a tool call ends the turn
without a second model call. Pass `model` in `AgentConfig` to use another model name or a `Model`
instance.

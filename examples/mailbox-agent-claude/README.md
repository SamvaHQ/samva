# Mailbox agent with Claude + Samva

A runnable TypeScript agent that answers customers from a Samva mailbox, on email and WhatsApp.
It follows the mailbox event stream, asks Claude to draft a reply to each message from
instructions you give it, and submits the reply through Samva, where the mailbox's rules hold it
until a person approves it.

- `src/agent.ts` follows `samva.mailboxes.events` for one mailbox and replies with
  `samva.mailboxes.reply`. A WhatsApp message arrives as the same event and is answered by the
  same call with `channel: "whatsapp"`.
- `src/draft.ts` is the model call: one request per message with the
  [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript), returning
  structured output that is either a reply or "leave this for a person".

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth
(cursor recovery, the webhook extension form) with a fixed reply instead of a model.

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
- **The model can decline.** It returns `leave_for_person` when the instructions do not cover the
  question, and the agent sends nothing. A refusal or a cut-off response is treated the same way.
- **Idempotent replies.** Each reply is keyed by the event id, so a replayed event cannot send
  twice.
  A replay that drafts different text is refused with `MailboxSendConflictError`, which carries
  the first reply's receipt; any other conflict, such as a paused mailbox, is a failure.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests use the Samva client with a mocked HTTP transport and a stand-in for the Anthropic
client. They never contact Samva or Anthropic.

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

`src/draft.ts` uses `claude-opus-5-5` at low effort, with the system prompt cached and
Anthropic's server-side fallback turned on, so a message the model declines is retried on a
fallback model. `Drafter` is one function from a message to a reply or `undefined`; replace
`claudeDrafter` with any other implementation.

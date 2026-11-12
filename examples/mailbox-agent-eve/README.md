# Mailbox agent with Eve + Samva

An [Eve](https://eve.dev) agent that answers customers from a Samva mailbox, on email and WhatsApp.
Eve runs the agent loop. Samva's actions are the two tools the agent calls, and the mailbox's
rules hold each reply until a person approves it.

Eve agents are files and run as a server, so this example is two processes:

1. **The Eve server** runs the agent in `agent/`. `agent/channels/samva.ts` is a channel with one
   route, `POST /samva/messages`, that starts one agent run per message.
2. **The relay** (`src/main.ts`) follows `samva.mailboxes.events` for one mailbox and posts each
   received message to that route, once Eve accepts it.

## Layout

- `agent/instructions.md` is the system prompt and the business's instructions. Edit the last
  section for your business.
- `agent/agent.ts` sets the model with `defineAgent`.
- `agent/channels/samva.ts` defines the channel. It keeps the mailbox id, message id, event id and
  channel in channel state, outside the prompt.
- `agent/tools/reply_to_customer.ts` submits the reply through `samva.mailboxes.reply`.
  `agent/tools/leave_for_person.ts` records a short reason and sends nothing. Both read the ids from
  `ctx.channel.metadata`, so the model supplies only the reply text or the reason. It cannot choose
  the recipient, channel, or thread. Both set `endsTurn: true`.
- `agent/lib/` holds the helpers the channel and tools share.
- `src/relay.ts` and `src/main.ts` are the relay.

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth with a
fixed reply instead of a model. [`mailbox-agent-ai-sdk`](../mailbox-agent-ai-sdk) does the same
job in one process with the Vercel AI SDK.

## Safety stance

- **A person approves every send.** Give the agent a mailbox-scoped key whose policy is
  `{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
  `state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
  with `samva login` in the CLI. An API key can never approve a send. See the
  [mailboxes cookbook](../../cookbooks/mailboxes.md).
- **Mail is untrusted data.** The customer's message reaches the model inside
  `<customer_message>` tags, and the instructions tell the model never to follow instructions found
  there. The approval rule is what makes that safe to rely on.
- **One action per message.** The first tool call for an event claims it, so a model that calls
  both tools in one step cannot submit a reply and also leave the message for a person.
- **The model can decline.** It calls `leave_for_person` when the instructions do not cover the
  question. If a run ends without calling either tool, nothing is sent: the channel has no path
  that delivers the model's text.
- **One run per message, no repeats.** The event id names the Eve session and keys the send, so a
  redelivered event reaches the same run and is ignored. Each reply is keyed `reply:<eventId>`, so
  a replayed event cannot send twice. If the replay drafts different text, Samva refuses it with
  `MailboxSendConflictError`, which carries the first reply's receipt, and the tool reports
  `alreadyAnswered`. Any other conflict, such as a paused mailbox, is a failure. If a WhatsApp service window has closed, the tool
  reports `windowClosed`.
- **The relay token.** The route accepts only requests carrying `EVE_RELAY_TOKEN` as a bearer token.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
```

The tests call the two tool files' `execute` functions with a hand-built context and the real
Samva client on a mocked transport. They also test the relay's event handling and the channel's
intake. They never contact Samva or a model provider.

They do **not** run an Eve agent. Eve's own test double, `mockModel` from `eve/evals`, works
inside a running agent server through `eve eval`, and this example has no such eval. So the tests
do not cover Eve's tool loop, `endsTurn`, how Eve fills `ctx.channel.metadata` from channel state,
or the model's behavior. Check those by running the agent below.

## Run it

Start the Eve server (Node.js 24 or newer):

```sh
SAMVA_API_KEY=samva_sk_test_... \
ANTHROPIC_API_KEY=sk-ant-... \
EVE_RELAY_TOKEN=choose-a-long-random-string \
bun run dev
```

In a second terminal, start the relay with the same key and token:

```sh
SAMVA_API_KEY=samva_sk_test_... \
SAMVA_MAILBOX_ID=mbx_... \
EVE_RELAY_TOKEN=choose-a-long-random-string \
EVE_URL=http://127.0.0.1:2000 \
bun run relay
```

`EVE_URL` is optional and defaults to `http://127.0.0.1:2000`, the address Eve's client docs use for a local server. Set it if your server listens elsewhere. Send the
mailbox an email, then approve or deny the held reply in the dashboard. The relay keeps its stream
cursor in memory, so a restart resumes from live events; persist it in production.

To answer WhatsApp from the same mailbox, add a number your organization has connected as an
endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan.

## Change the model

`agent/agent.ts` passes `anthropic("claude-opus-5-5")` from `eve/models/anthropic`, which reads
`ANTHROPIC_API_KEY`. Eve also accepts an AI Gateway model id string or any AI SDK language model in
`defineAgent`'s `model`.

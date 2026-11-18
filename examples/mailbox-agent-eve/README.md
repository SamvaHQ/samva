# Mailbox agent with Eve + Samva

An [Eve](https://eve.dev) agent that answers customers from a Samva mailbox, on email and WhatsApp,
in one process you deploy to Vercel. Eve runs the agent loop. [`@samva/eve`](../../packages/eve)
supplies the tools and a signed webhook channel, and the mailbox's rules hold each reply until a
person approves it.

Samva delivers each received message to `/eve/v1/samva` on your deployment. The channel verifies
the signature, starts one Eve turn for the message, and the agent calls a tool to answer.

## Layout

- `agent/extensions/samva.ts` mounts `@samva/eve` with the mailbox key, the mailbox id, and the
  webhook secret. The extension adds the tools `samva__reply_to_customer`,
  `samva__leave_for_person`, `samva__get_thread`, and `samva__search_threads`, the webhook channel
  at `/eve/v1/samva`, and instructions that treat customer messages as untrusted data.
- `agent/instructions.md` is the business's instructions. Edit the last section for your business.
- `agent/agent.ts` sets the model with `defineAgent`.

The reply and leave tools take the mailbox, message, and channel from the verified delivery, so the
model supplies only the reply text, a reason, or search criteria. It cannot choose the recipient,
channel, or thread.

The [`mailbox-agent`](../mailbox-agent) example covers the mailbox mechanics in more depth with a
fixed reply instead of a model. [`mailbox-agent-ai-sdk`](../mailbox-agent-ai-sdk) does the same
job with the Vercel AI SDK and follows the mailbox event stream instead of a webhook.

## Environment

| Variable               | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `SAMVA_API_KEY`        | A mailbox-scoped Samva API key.                                                    |
| `SAMVA_MAILBOX_ID`     | The mailbox the agent answers.                                                     |
| `SAMVA_WEBHOOK_SECRET` | The signing secret of the webhook that delivers `mailbox.message.received`.        |
| `ANTHROPIC_API_KEY`    | The model key. Replace the model in `agent/agent.ts` to use another provider.      |
| `REDIS_URL` (optional) | A Redis server for shared Chat SDK state. Set it when more than one instance runs. |

Eve evaluates the extension at build time, so the Samva variables must exist when the project
builds, and a missing one fails the build with its name.

## Safety stance

- **A person approves every send.** Give the agent a mailbox-scoped key whose policy is
  `{ match: { effect: "write" }, atLeast: "person" }`. A reply then returns
  `state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
  with `samva login` in the CLI. An API key can never approve a send. See the
  [mailboxes cookbook](../../cookbooks/mailboxes.md).
- **Mail is untrusted data.** The extension's instructions tell the model to answer a customer
  message and never follow instructions inside it. The approval rule is what makes that safe to
  rely on.
- **One action per message.** The first tool call for a delivery claims it, so a model that calls
  both action tools cannot submit a reply and also leave the message for a person.
- **The model can decline.** It calls `leave_for_person` when the instructions do not cover the
  question. The channel has no path that delivers the model's text, so a turn that calls neither
  tool sends nothing.
- **No repeats.** Each reply is keyed `reply:<delivery id>`. Chat SDK state records delivery ids,
  so a redelivered webhook starts no second turn, and a replay that drafts different text recovers
  the first reply's receipt. Use shared state (`REDIS_URL`) when more than one instance serves the
  route, so every instance sees the same delivery ids.
- **Signed deliveries.** The channel rejects a request whose signature does not verify with
  `SAMVA_WEBHOOK_SECRET`.

## Run the proof

```sh
bun install
bun run typecheck
bun run test
SAMVA_API_KEY=samva_sk_test_x SAMVA_MAILBOX_ID=mbx_x SAMVA_WEBHOOK_SECRET=whsec_x \
  ANTHROPIC_API_KEY=x bun run build
```

The tests check the extension's required configuration and the instructions. They never contact
Samva or a model provider. Building needs Node.js 24 or newer.

They do not run an Eve turn. To check one, start the server with `bun run dev`, send it a signed
`mailbox.message.received` delivery with a test webhook secret and a model of your choice, and
watch the held reply appear in the mailbox.

## Run it locally

Start the server (Node.js 24 or newer):

```sh
SAMVA_API_KEY=samva_sk_test_... \
SAMVA_MAILBOX_ID=mbx_... \
SAMVA_WEBHOOK_SECRET=whsec_... \
ANTHROPIC_API_KEY=sk-ant-... \
bun run dev
```

Expose the server with a tunnel and create a webhook for the mailbox that points at
`<tunnel URL>/eve/v1/samva`. Send the mailbox an email, then approve or deny the held reply in the
dashboard.

To answer WhatsApp from the same mailbox, add a number your organization has connected as an
endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan, and free-form text needs an open 24-hour service window.

## Deploy to Vercel

See the [Vercel cookbook](../../cookbooks/vercel.md): deploy this directory with `eve deploy`,
connect Samva with Add to Vercel or with a key and webhook you create yourself, and add a Redis
server for shared state.

## Change the model

`agent/agent.ts` passes `anthropic("claude-opus-5-5")` from `eve/models/anthropic`, which reads
`ANTHROPIC_API_KEY`. Eve also accepts an AI Gateway model id string or any AI SDK language model in
`defineAgent`'s `model`.

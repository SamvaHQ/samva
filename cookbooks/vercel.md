# Run an email and WhatsApp agent on Vercel with Samva

Deploy an agent to Vercel that answers a Samva mailbox on email and WhatsApp. Samva delivers each
received message to your deployment as a signed webhook, the agent answers with tools, and the
mailbox's rules hold each reply until a person approves it.

This cookbook deploys the [`mailbox-agent-eve`](../examples/mailbox-agent-eve) example. It is one
Eve process built on [`@samva/eve`](../packages/eve), with no relay or second service. For the
agent itself, see the [Eve cookbook](./eve.md). For the mailbox, see the
[mailboxes cookbook](./mailboxes.md).

## What the deployment needs

| Variable               | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `SAMVA_API_KEY`        | A mailbox-scoped Samva API key.                                             |
| `SAMVA_MAILBOX_ID`     | The mailbox the agent answers.                                              |
| `SAMVA_WEBHOOK_SECRET` | The signing secret of the webhook that delivers `mailbox.message.received`. |
| `ANTHROPIC_API_KEY`    | The model key. A model id string routed through the AI Gateway needs none.  |
| `REDIS_URL`            | A Redis server that every instance shares, for delivery deduplication.      |

Eve evaluates the Samva extension when the project builds, so set the Samva variables before the
deploy builds. A missing one fails the build and names the variable.

## Deploy the agent

From `examples/mailbox-agent-eve`, with Node.js 24 or newer:

```sh
bunx eve link
bunx eve deploy
```

`eve link` links or creates the Vercel project, and `eve deploy` builds and deploys it to
production. Set the variables in the project's environment settings, or let Add to Vercel write
them as described next. The agent answers at `https://<production URL>/eve/v1/samva`.

## Connect Samva with Add to Vercel

Add to Vercel connects a Samva mailbox to your Vercel projects from the Samva dashboard. The
install works like this:

1. Sign in to Samva and pick a mailbox, or create one.
2. Choose the Vercel projects that run the agent.
3. Samva creates a key scoped to that mailbox, with a rule that holds every send for a person, and
   writes `SAMVA_API_KEY` and `SAMVA_MAILBOX_ID` to the chosen projects.
4. Optionally, Samva creates a webhook for the mailbox that delivers received messages to
   `<production URL>/eve/v1/samva`, and writes its signing secret as `SAMVA_WEBHOOK_SECRET`.

Redeploy the project after the install so the build sees the new variables. Removing the
integration from Vercel revokes the keys it created.

## Connect Samva by hand

Create the key and the webhook yourself when you do not use the install. Setup uses a person's
session, as in the [mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key): create a
restricted key for the mailbox, set its policy to `{ match: { effect: "write" }, atLeast: "person" }`,
and keep the key. Then create the webhook with the SDK:

```ts
const endpoint = await samva.webhooks.create({
  name: "Vercel agent",
  url: "https://<production URL>/eve/v1/samva",
  eventTypes: ["mailbox.message.received"],
  mailboxIds: [mailbox.id],
});
```

The CLI does the same with
`samva webhooks create --data '{"name":"Vercel agent","url":"https://<production URL>/eve/v1/samva","eventTypes":["mailbox.message.received"],"mailboxIds":["<mailbox id>"]}'`,
and `samva webhooks secret <id>` reads the signing secret again later. Put the key, the mailbox id,
and the secret in the Vercel project's environment as `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, and
`SAMVA_WEBHOOK_SECRET`, then redeploy.

## Share delivery state across instances

Samva delivers each event at least once, and Vercel can run several instances of the route. The
channel records each verified delivery id in Chat SDK state, so instances need one shared state
store to answer a redelivery once. Add a Redis server to the project, such as one from the Vercel
Marketplace, and set `REDIS_URL`. The example switches from memory state to Redis state when it is
set. Replies are also keyed `reply:<delivery id>`, so a repeat that gets past the state check
recovers the first reply's receipt instead of sending again.

## Check it

Send the mailbox an email. The agent's reply appears as a held action in the dashboard, and
nothing reaches the customer until a person approves it. To answer WhatsApp from the same mailbox,
add a number your organization has connected as an endpoint on it
([Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox)).
WhatsApp needs a paid plan, and free-form text needs an open 24-hour service window.

## Use the AI SDK instead

An agent built with the [Vercel AI SDK](./vercel-ai-sdk.md) deploys the same way. It needs
`SAMVA_API_KEY` and `SAMVA_MAILBOX_ID`, and it gets its tools from `samvaTools`. Receive messages
at a route handler that verifies the signed delivery with `@samva/webhooks`, then run one turn per
delivery with the delivery id as the event id.

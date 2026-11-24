# Give an Eve agent an email inbox with Samva

Give an [Eve](https://eve.dev) agent its own email address and WhatsApp number. A Samva mailbox
delivers each received message to the agent as a signed webhook, and the agent replies through the
same API. The mailbox's rules can hold each reply until a person approves it.

The runnable example lives in [`examples/mailbox-agent-eve`](../examples/mailbox-agent-eve). For
the mailbox itself, see the [mailboxes cookbook](./mailboxes.md). To run the agent on Vercel, see
the [Vercel cookbook](./vercel.md).

## What you build

One Eve process. [`@samva/eve`](../packages/eve) mounts into the agent as an extension and brings
four things: a webhook channel at `/eve/v1/samva` that verifies Samva's signature and starts one
turn per received message, the tools `samva__reply_to_customer`, `samva__leave_for_person`,
`samva__get_thread`, and `samva__search_threads`, and instructions that treat customer messages as
untrusted data. A turn that calls neither action tool sends nothing.

## Install

```sh
bun add @samva/eve eve ai chat samva @chat-adapter/state-memory @chat-adapter/state-redis
```

The example uses `eve@^1.0.0-rc.10`, `ai@^7.0.170`, `samva@^0.51.0`, and Node.js 24 or newer.
Create a mailbox and a restricted key as shown in the
[mailboxes cookbook](./mailboxes.md#create-a-mailbox-and-a-scoped-key), and give the agent only
that key. Create a webhook for the mailbox that delivers `mailbox.message.received` to
`<your URL>/eve/v1/samva`, and keep its signing secret. The webhook's create response holds
`secret`; `GET /v1/webhooks/{id}/secret` and the MCP tool `webhooks_get_secret` return it later.
The bundled channel needs a public URL.

## The agent

The agent is `agent/instructions.md`, which holds your business's instructions, and
`agent/agent.ts`, which chooses the model:

```ts
import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

export default defineAgent({
  model: anthropic("claude-opus-5-5"),
});
```

`anthropic()` reads `ANTHROPIC_API_KEY`. Eve also accepts a model id string that routes through the
Vercel AI Gateway, or any AI SDK language model. A model id Eve has no AI Gateway context window
metadata for fails the build with "does not have known AI Gateway context window metadata", so pick
an id Eve knows.

## The extension

`agent/extensions/samva.ts` mounts Samva. It reads the three Samva variables and fails when one is
missing:

```ts
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import samva from "@samva/eve";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Missing required env var ${name}`);
  return value;
}

export default samva({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhook: {
    secret: required("SAMVA_WEBHOOK_SECRET"),
    state: process.env.REDIS_URL ? createRedisState() : createMemoryState(),
  },
});
```

The reply and leave tools take the mailbox, message, and channel from the verified delivery, so the
model supplies only the reply text or a reason. It cannot choose the recipient, channel, or thread.
Both end the turn, and the first one called claims the message, so a turn cannot reply and also
leave the message for a person.

## Delivery and duplicates

Samva delivers each event at least once. The channel records each verified delivery id in Chat
SDK state, so a redelivery starts no second turn. Memory state suits one local process. When more
than one instance serves the route, give them shared state such as Redis, so each instance sees
the same delivery ids. Each reply is keyed `reply:<delivery id>`. A replay that drafts different
text recovers the first reply's receipt instead of sending twice.

Use an existing Eve channel instead by omitting `webhook`. The extension then mounts no channel or
route, and only `SAMVA_API_KEY` and `SAMVA_MAILBOX_ID` are needed. Expose `eventId`, `mailboxId`,
`messageId`, and `channel` from the channel's server-owned metadata after verifying the event. The
four tools and the untrusted-message instructions appear on turns that carry them. Never fill them
from model input or customer text.

## The approval rule

Give the agent a mailbox-scoped key whose policy is
`{ match: { effect: "write" }, atLeast: "person" }`. A person sets the rule while signed in, or an
organization-wide API key sets it on the agent's key; the agent's own key cannot set or lift it. A
reply then returns
`state: "approvalRequired"`, and nothing is sent until a person approves it in the dashboard or
with `samva login`. An API key can never approve a send, so a message that talks the model into a
bad reply still waits for a person. The mailboxes cookbook shows how to
[set the policy](./mailboxes.md#create-a-mailbox-and-a-scoped-key) and how a person
[approves or denies](./mailboxes.md#reply-and-the-approval-flow) a held reply.

A reply that stays `queued` has a `waitReason` or `problem.code` on its receipt, for example
`onboarding-review` while a new organization's email onboarding review is pending. Check with
`samva email review status`. See
[A send that stays queued](https://samva.dev/docs/mailboxes/approvals#a-send-that-stays-queued).

## WhatsApp from the same mailbox

Add a number your organization has connected as an endpoint on the mailbox, and a WhatsApp message
arrives as the same event. The reply tool answers it on WhatsApp. See
[Answer WhatsApp in a mailbox](https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox).
WhatsApp needs a paid plan, and free-form text needs an open 24-hour service window.

## Example

See the runnable [`mailbox-agent-eve` example](../examples/mailbox-agent-eve).

```sh
bun --cwd examples/mailbox-agent-eve run typecheck
bun --cwd examples/mailbox-agent-eve run test
```

# @samva/eve

<img src="https://samva.dev/icon-192.png" alt="Samva" width="48" height="48">

[![npm](https://img.shields.io/npm/v/@samva/eve)](https://www.npmjs.com/package/@samva/eve) [![license](https://img.shields.io/npm/l/@samva/eve)](./LICENSE)

Mount Samva's mailbox tools and customer-message instructions in an Eve agent. The extension can also mount a Chat SDK channel for signed email and WhatsApp webhooks.

```sh
npm install @samva/eve eve ai chat samva @chat-adapter/state-memory
```

Set `SAMVA_API_KEY`, `SAMVA_MAILBOX_ID`, and `SAMVA_WEBHOOK_SECRET` in the Vercel project before deploying or running a build. Eve evaluates the extension during the build, so all three variables must be available at build time for the target environment. Point the mailbox's `mailbox.message.received` webhook at `/eve/v1/samva` on the agent deployment.

`SAMVA_WEBHOOK_SECRET` exists only after you create the mailbox webhook. The create response holds its `secret`; `GET /v1/webhooks/{id}/secret` and the MCP tool `webhooks_get_secret` return it later. The bundled channel needs a public URL.

Before running the agent, create a mailbox-scoped API key for it and give that key the approval rule `{ match: { effect: "write" }, atLeast: "person" }`. A person sets the rule while signed in, or an organization-wide API key sets it on the agent's key (`policies.setPolicy`, `PUT /v1/policies/apiKey/{id}`). The agent's own key cannot set or lift its rule, and it can never approve or deny a send. In a test conversation, verify the reply returns `approvalRequired` and review it in the dashboard. See the [mailbox approval setup](https://github.com/SamvaHQ/samva/blob/main/cookbooks/mailboxes.md). A reply that stays `queued` has a `waitReason` or `problem.code` on its receipt, for example `onboarding-review` while a new organization's email onboarding review is pending. Check with `samva email review status`. See [A send that stays queued](https://samva.dev/docs/mailboxes/approvals#a-send-that-stays-queued).

```ts
// agent/extensions/samva.ts
import { createMemoryState } from "@chat-adapter/state-memory";
import samva from "@samva/eve";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

export default samva({
  apiKey: required("SAMVA_API_KEY"),
  mailboxId: required("SAMVA_MAILBOX_ID"),
  webhook: {
    secret: required("SAMVA_WEBHOOK_SECRET"),
    state: createMemoryState(),
  },
});
```

Use a shared Chat SDK state adapter in a deployment with multiple instances. The channel starts Eve turns on signed deliveries and queues new inputs for a thread while a turn is active. The reply tool submits through Samva approval rules. Eve's channel output remains in the session so it cannot also send a customer reply.

The bundled channel skips automated email by default and includes the subject alongside the email body in the agent input. Set `webhook.includeAutomatedEmail: true` to let automated mail start turns.

To use an existing Eve channel, omit `webhook`. The extension then mounts no channel or route, and only `SAMVA_API_KEY` and `SAMVA_MAILBOX_ID` are needed. Expose `eventId`, `mailboxId`, `messageId`, and `channel` (`email` or `whatsapp`) via the channel's server-owned metadata after verifying the event. The instructions stay mounted, and the four tools appear on turns with a matching inbound message. Never populate these fields from model input or customer-supplied text.

## License

MIT

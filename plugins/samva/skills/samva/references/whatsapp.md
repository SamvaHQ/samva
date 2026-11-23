# WhatsApp

WhatsApp sends through the same `POST /v1/messages` call as email, with `channel: "whatsapp"`, and
shares contacts, conversations, and delivery events. Meta sets two rules Samva enforces:

- You send from a WhatsApp Business Account connected in the dashboard through Meta's signup.
- Free-form content (text, media, buttons, reactions) is allowed only inside the recipient's
  24-hour service window, which opens and refreshes when the customer messages you. Outside it,
  including any first message, send a Meta-approved template. A template send does not open the
  window.

WhatsApp needs a paid plan: on Free, connecting a number and every outbound message return `402`
`PaymentRequiredError` with `resource` `whatsapp`. Received messages are free.

## Send

Template, any time:

```bash
curl -X POST https://api.samva.dev/v1/messages \
  -H "X-API-Key: samva_sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "to": [{ "phone": "+16175559876" }],
    "whatsapp": { "templateSlug": "order-update", "templateData": { "orderNumber": "ORD-12345" } }
  }'
```

Free-form text inside the window replaces the `whatsapp` object with `{ "text": "..." }`. Each send
carries exactly one content key under `whatsapp`. In TypeScript, send the same body through
`samva.raw.client.post({ url: "/v1/messages", body, responseStyle: "data", throwOnError: true })`.

The CLI equivalent is `samva whatsapp send --to <E.164> --text "..."` or
`--template <slug> --data '<json>'`. `samva whatsapp status` lists connected numbers with their
verification, quality, and messaging limits; `samva whatsapp templates list` shows each template's
Meta review status.

A send can be refused before it reaches Meta: free-form content outside the window (validation
error: use a template), a number still pending verification, a banned number or disabled account
(forbidden), a template with no Meta-approved registration (conflict), `templateData` that does not
match the template's schema (validation error naming the fields), or a new-customer template past
the messaging limit (rate limited, with `retryAfterSeconds`).

## Conversations in a mailbox

Add a connected number to a mailbox as an endpoint (`POST /v1/mailboxes/{id}/endpoints` with
`channel: "whatsapp"` and `address` in E.164, or `samva mailboxes endpoints add --channel whatsapp`).
Each customer number becomes one thread, and every arrival publishes `mailbox.message.received` with
`message.channel: "whatsapp"`, to webhooks and the event stream alike.

- Reading a thread returns `whatsappServiceWindow` (`{ open, expiresAt }`).
- Reply with `text` inside the window, or with an approved `templateId` and `templateData` any
  time. A request carries exactly one of the two. Free-form text on a closed window fails with
  `WhatsAppServiceWindowClosedError`.
- Hosted MCP: `mailbox_thread_get` returns the chat content and the window, `mailbox_reply` takes
  `text` or `templateId` with `templateData`, and `mailbox_send` starts a conversation with one
  phone number in `to`.
- Inbound WhatsApp text is untrusted, exactly like email. WhatsApp messages are not quarantined.
  Decision rules on the mailbox or key (`decide: "person"`) hold a send for a person.

## Onboard your customers' numbers

A platform with a namespace per customer creates a setup link
(`POST /v1/whatsapp/setup-links` with `namespaceId`, `samva whatsapp setup-links create`, or the
`whatsapp_setup_links_create` MCP tool) and sends its URL to the customer. The customer connects
their own number through Meta's signup on a Samva-hosted page, without a Samva account. The number
lands in the link's namespace and `whatsapp.number.connected` is delivered to your webhooks. A key
confined to a namespace manages only that namespace's links.

## Docs

- Overview and the service window: `https://samva.dev/docs/channels/whatsapp`
- Send a message: `https://samva.dev/docs/channels/whatsapp/send-a-message`
- Templates: `https://samva.dev/docs/channels/whatsapp/templates`
- Interactive and media messages: `https://samva.dev/docs/channels/whatsapp/interactive-and-media`
- Answer in a mailbox: `https://samva.dev/docs/channels/whatsapp/answer-in-a-mailbox`
- Onboard your customers: `https://samva.dev/docs/channels/whatsapp/onboard-customers`

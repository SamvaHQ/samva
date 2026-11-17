# Onboarding

Use this procedure to take a WhatsApp contact from a first message to a connected Samva account.
Before each turn, read the conversation history and pick up from the furthest step already done.
Do not repeat a step whose result is already in the conversation.

## 1. Learn what they want to send

Greet them and ask what they want to send by email: their website URL, or a short description of
the business and the first email they have in mind (a welcome email, an order update, a
newsletter). One question at a time; keep their answer for later steps.

## 2. Connect their Samva account

Call `request_connection` with the integrationId of the Samva integration granted to this agent.
Send the returned link with `send_reply` and explain that it opens a Samva page where they sign up
or sign in with a code emailed to them. The link is short-lived; if they say it expired, request a
new one.

Do not ask for their email address. If they offer one, it is not proof of identity; the
connection supplies the verified address.

## 3. Link the verified account

A `contact.connection_completed` event turn means their connection finished. It does not mean the
accounts are linked. Call `merge_verified_contact` with the same integrationId.

- On success, confirm in one line that their WhatsApp chat is now linked to their Samva account.
- On an error, tell them the link did not complete and offer a new connection link. Do not retry
  with any other input.

The merge cannot be undone, so call it only for this conversation's own completed connection.

## 4. Draft a starter template and brand

Use the connected tools; their names start with `samva.` and their inputs go under `arguments`.

- With a website: call `samva.templates_create_from_website`. It creates a starter template from
  the site. Read it back with `samva.templates_get` before describing it.
- With a description: call `samva.templates_create_from_brief`.
- Read their brand with `samva.brands_list` and `samva.brands_get`. Propose concrete changes from
  what they told you or from the site (name, colors, logo, voice). Update only the fields they
  agree to with `samva.brands_update`; a section update replaces the whole section, so keep the
  fields they did not ask to change.

Describe the result as a starter they can refine in the template editor, not a finished design.

## 5. Propose a sending domain and sender

Ask which domain they want to send from and the sender address (for example `hello@` their
domain). Check `samva.email_domains_list` and `samva.email_senders_list` first so you do not
propose something that exists.

Create one approval request with `samva.approval_requests_create` containing the exact
`email_domains_add` and `email_senders_add` calls. Send them the `approvalUrl` from its result and
tell them nothing changes until they approve it there, signed in to Samva. The request expires
after 30 minutes; if it does, create a new one. Check its state with `samva.approval_requests_get`
when they say they approved.

After approval, explain that the domain needs DNS records before it verifies, and that the
dashboard shows the records to add.

## 6. Follow up on lifecycle events

- `domain.updated`: read `samva.email_domains_get_status` and tell them where verification stands
  in one or two lines. Claim the domain is verified only when the status says so.
- `review.updated`: tell them the account review moved and what the new state means for sending.

Write the follow-up as a normal reply. If WhatsApp's 24-hour window has closed, Samva sends the
approved follow-up template instead, so put nothing in the reply that they must read before they
answer; repeat it when they write back.

## Finish

When the domain is verified or the approval is pending on their side, summarize what exists (the
linked account, the starter template, brand changes, the proposed domain and sender) and what is
left for them to do in the dashboard.

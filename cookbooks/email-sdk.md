# Email SDK with Samva

Use Samva as a provider-owned community adapter behind Email SDK's normalized
send API. This recipe is server-side: never expose a Samva API key to browser
code.

The adapter is community-maintained by Samva rather than built into Email SDK.
Its current validation is no-network contract coverage and fresh packed
consumers; a live Samva account send has not yet been recorded for this release.

## Install

```sh
bun add @samva/email-sdk @opencoredev/email-sdk samva
```

## Send with the direct adapter

```ts
import { createEmailClient } from "@opencoredev/email-sdk";
import { samva } from "@samva/email-sdk";

const apiKey = process.env.SAMVA_API_KEY;
if (!apiKey) throw new Error("SAMVA_API_KEY is required");

const email = createEmailClient({
  adapters: [samva({ apiKey })],
});

const result = await email.send({
  from: "Samva <hello@example.com>",
  to: { email: "ada@example.com", name: "Ada" },
  cc: "team@example.com",
  replyTo: "support@example.com",
  subject: "Welcome",
  html: "<p>Your workspace is ready.</p>",
  text: "Your workspace is ready.",
  metadata: { accountId: "account_123" },
  attachments: [
    {
      filename: "welcome.txt",
      content: "Your workspace is ready.",
      contentType: "text/plain",
    },
  ],
});

console.log({ adapter: result.adapter, id: result.id });
```

## Register through a plugin

```ts
import { createEmailClient } from "@opencoredev/email-sdk";
import { samvaPlugin } from "@samva/email-sdk";

const apiKey = process.env.SAMVA_API_KEY;
if (!apiKey) throw new Error("SAMVA_API_KEY is required");

const email = createEmailClient({
  plugins: [samvaPlugin({ apiKey })],
});
```

## Supported contract

- Bare, display-form, and object addresses are normalized for `from`, `to`,
  `cc`, and `bcc`.
- Bare reply-to addresses, subject, HTML, text, metadata, and supported
  in-memory attachments are forwarded.
- Attachments require `contentType`; raw or base64 strings and Web API binary
  values are converted to base64 with exact byte size.
- Unsupported or lossy fields fail before the Samva client is called. This
  includes headers, tags, schedules, and attachment paths and inline metadata.
- A send `idempotencyKey` is forwarded as Samva's `Idempotency-Key` header.
  Pass it in Email SDK send options (`email.send(message, { idempotencyKey })`),
  not as a message field.
- Email SDK expands personalized sends to one Samva call per recipient.

## Fallback safety

The adapter reports known pre-acceptance rejections as `delivery: "not_sent"`.
Transport loss, ambiguous server failures, and malformed success responses use
`delivery: "unknown"`. Email SDK stops fallback on unknown delivery by default
to avoid a duplicate send. Read the
[Email SDK fallback model](https://email-sdk.dev/docs/concepts/fallbacks-and-retries)
before overriding that policy.

For reusable HTML templates, render a string first with the
[React Email cookbook](./react-email.md), then pass the rendered HTML to
`email.send`.

## Validate locally

The repository package tests inject a Samva client or fetch implementation, so
they never contact an account:

```sh
bun --filter @samva/email-sdk typecheck
bun --filter @samva/email-sdk test
bun --filter @samva/email-sdk build
```

Only an explicit application call to `email.send` performs a send.

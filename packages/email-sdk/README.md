# `@samva/email-sdk`

Provider-owned Samva community adapter for
[Email SDK](https://email-sdk.dev). It targets `@opencoredev/email-sdk@^1.1.0`
and `samva@^0.5.0`.

This adapter is maintained by Samva as a community integration; it is not an
official built-in Email SDK adapter.

## Install

```sh
bun add @samva/email-sdk @opencoredev/email-sdk samva
```

## Register the adapter

Keep the Samva API key on the server. The package does not read environment
variables or load `.env` files.

```ts
import { createEmailClient } from "@opencoredev/email-sdk";
import { samva } from "@samva/email-sdk";

const email = createEmailClient({
  adapters: [samva({ apiKey: process.env.SAMVA_API_KEY! })],
});

const result = await email.send({
  from: "Samva <hello@example.com>",
  to: "ada@example.com",
  subject: "Welcome",
  html: "<p>Your workspace is ready.</p>",
  text: "Your workspace is ready.",
});

console.log(result.adapter, result.id);
```

You can also register the adapter through a plugin:

```ts
import { createEmailClient } from "@opencoredev/email-sdk";
import { samvaPlugin } from "@samva/email-sdk";

const email = createEmailClient({
  plugins: [samvaPlugin({ apiKey: process.env.SAMVA_API_KEY! })],
});
```

`samva()` also accepts `baseUrl`, `fetch`, and `headers`, or a preconfigured
Samva Promise `client`. An API key is required unless a client is injected.

## Field support

| Email SDK input                               | Behavior                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `from`, `to`, `cc`, `bcc`                     | Bare, display-form, and object addresses become Samva address objects; malformed or ambiguous forms are rejected.             |
| `replyTo`                                     | Bare addresses are forwarded. Display names are rejected because Samva cannot preserve them.                                  |
| `subject`, `html`, `text`                     | Forwarded without rewriting.                                                                                                  |
| `metadata`                                    | Forwarded to Samva message metadata.                                                                                          |
| In-memory attachments                         | Raw or base64 strings, `Uint8Array`, `ArrayBuffer`, and `Blob` become base64 with exact byte size. `contentType` is required. |
| `headers`, `tags`, `sendAt`                   | Rejected before the Samva client is called.                                                                                   |
| Attachment `path`, `contentId`, `disposition` | Rejected before the Samva client is called. URL attachment paths are not supported.                                           |
| Send `idempotencyKey`                         | Forwarded as Samva's `Idempotency-Key` header.                                                                                |

Capabilities are declared exactly as follows:

```ts
{
  repeatedHeaders: false,
  idempotency: "native",
  scheduling: false,
  personalized: "expanded",
}
```

Email SDK expands personalized sends into one Samva call per recipient. The
adapter intentionally has no native `sendPersonalized` method.

## Results and failures

Successful sends return `{ adapter: "samva", id, raw }`. `raw` is the Samva
message result. Recipient queue states are not converted into final accepted or
rejected delivery claims.

Unsupported or lossy input throws `EmailValidationError` without calling
Samva. API and transport failures become a redacted `EmailAdapterError` with
status and `x-request-id` when available. Retryability is enabled for statuses
408, 425, 429, and 5xx; a `409 ConflictError` is non-retryable because replaying
the same request cannot succeed. Ambiguous transport, server, and malformed-success
outcomes use `delivery: "unknown"`; fallback therefore stops unless the
application explicitly opts into continuing after unknown delivery.

Abort signals are forwarded to the Samva Promise client and retain Email SDK's
`EmailAbortError` behavior. The adapter send path uses Web APIs and has no
`node:*` imports.

See Email SDK's
[fallback and retry model](https://email-sdk.dev/docs/concepts/fallbacks-and-retries)
before composing multiple adapters.

## More examples

- [Samva + Email SDK cookbook](../../cookbooks/email-sdk.md)
- [React Email rendering cookbook](../../cookbooks/react-email.md)

## License

[MIT](../../LICENSE)

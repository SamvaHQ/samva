# Effect SDK with Samva

Use `samva/effect` when your app already runs on
[Effect](https://effect.website).
Import `Client` and `Email` from `samva/effect`.
Call `Email.send`. Provide `Client.layerFetch` with your API key.
The client fails with semantic tagged errors.
Retry is on by default for idempotent sends.

If you do not use Effect, import `createClient` from `samva`.
The payload is the same. This cookbook covers the Effect runtime.

## Setup

```sh
bun add samva effect@4.0.0-rc.112
```

Keep `SAMVA_API_KEY` on the server.
Pin Effect 4 to `4.0.0-rc.112` to match the SDK peer dependency exactly.
Effect 4 is a release candidate. HTTP client modules live under
`effect/unstable/http`. `Client.layerFetch` already provides the fetch layer.

## First send

Call `Email.send`. Provide `Client.layerFetch` with your API key.
`Client.layerFetch` uses `globalThis.fetch`. You do not import `FetchHttpClient`.

```ts
import { Effect } from "effect";
import { Client, Email } from "samva/effect";

const program = Email.send({
  to: "ada@example.com",
  subject: "Hello",
  text: "Hi",
}).pipe(Effect.provide(Client.layerFetch({ apiKey: process.env.SAMVA_API_KEY! })));

const message = await Effect.runPromise(program);
console.log(message.id, message.status);
```

The `from` field is optional; omit it and Samva sends from the verified sender
on your account.

## Layer-provided client

For an application, provide `Client.layerFetch(config)` at the boundary.
Then call `Email.send` in the program.

```ts
import { Effect } from "effect";
import { Client, Email } from "samva/effect";

const SamvaLayer = Client.layerFetch({
  apiKey: process.env.SAMVA_API_KEY!,
});

const sendWelcome = (to: string) =>
  Email.send({
    to,
    subject: "Welcome",
    html: "<p>Your workspace is ready.</p>",
    text: "Your workspace is ready.",
  });

await Effect.runPromise(sendWelcome("ada@example.com").pipe(Effect.provide(SamvaLayer)));
```

Use `Client.layer(config)` when you provide your own `HttpClient.HttpClient` layer.

## Typed errors

The client is derived from the same API contract the Samva API serves.
Every operation fails with the server's own semantic tagged errors, such as
`RateLimitedError`, `ValidationError`, and `UnauthorizedError`.
Those errors land directly in the Effect error channel.
Match them by tag and read each error's own fields.
There is no per-status wrapper and no `cause` to unwrap.

```ts
import { Effect } from "effect";

const handled = sendWelcome("ada@example.com").pipe(
  Effect.catchTags({
    RateLimitedError: (error) =>
      Effect.succeed({
        retryAfterSeconds: error.retryAfterSeconds,
      }),
    ValidationError: (error) =>
      Effect.succeed({
        validationFields: error.fields ?? {},
      }),
    UnauthorizedError: () =>
      Effect.succeed({
        configurationError: "SAMVA_API_KEY is invalid or missing permissions.",
      }),
  }),
);
```

`retryAfterSeconds` is always a finite number.
`ValidationError.fields` is a `Record<string, string[]>` keyed by field name.

You can also handle a whole category at once.
The SDK exports `catchAuthError`, `catchValidationError`, `catchNotFoundError`,
`catchConflictError`, `catchThrottlingError`, `catchBillingError`, and
`catchTransient`.
It also exports matching `isAuthError`, `isRetryable`, and `isTransient`
predicates.
`catchAuthError` covers both `UnauthorizedError` and `ForbiddenError`.

```ts
import { Effect } from "effect";
import { catchAuthError, isRetryable } from "samva/effect";

const handledByCategory = sendWelcome("ada@example.com").pipe(
  catchAuthError(() => Effect.succeed({ configurationError: "SAMVA_API_KEY is unusable." })),
  Effect.match({
    onFailure: (error) => (isRetryable(error) ? "upstream_unavailable" : "failed"),
    onSuccess: (result) => result,
  }),
);
```

Timestamps use ISO 8601 strings. `message.createdAt` can be returned directly or
parsed into a `Date` when your application needs date operations.

```ts
const message = await Effect.runPromise(
  sendWelcome("ada@example.com").pipe(Effect.provide(SamvaLayer)),
);
console.log(message.createdAt);
```

## Default-on retry

Retry-safe operations retry on their own.
Do not wrap calls in `Effect.retry`.
Reads and sends retry on throttling `429`, transient server errors, and
request-transport failures.
Backoff is jittered exponential and bounded to four attempts.
A `429` waits for the server's `retryAfterSeconds` hint, capped at 60s.
Keyless mutating calls are never auto-retried.

Because retry is built in, a `RateLimitedError` or `InternalError` that reaches
your handler means retrying already failed to recover.

Override or disable the policy with the `Retry` layer.

```ts
import { Effect } from "effect";
import { Retry, isRetryable } from "samva/effect";

// No auto-retry for this program:
sendWelcome("ada@example.com").pipe(Effect.provide(Retry.layerDisabled));

// Or a custom policy, using any Effect.retry options:
sendWelcome("ada@example.com").pipe(Effect.provide(Retry.layer({ times: 6, while: isRetryable })));
```

## Idempotency keys

Every `Email.send` and `Messages.send` generates an `Idempotency-Key` per call.
That key is stable across the built-in retries.
A retried send never delivers twice.
Pass your own key to deduplicate a send you might replay from another process.
Reusing a key with identical content replays the original response.
Reusing it with different content fails with `ConflictError`.

```ts
Email.send(input, { idempotencyKey: "order-4417-receipt" });
```

## React Email

Samva accepts rendered `html` and optional `text`.
React Email stays in your app.
Render the component. Derive text. Pass the strings to `Email.send`.

```tsx
import { render, toPlainText } from "react-email";
import { Email } from "samva/effect";

const html = await render(<WelcomeEmail name="Ada" />);
const text = toPlainText(html);

Email.send({
  to: "ada@example.com",
  subject: "Welcome",
  html,
  text,
});
```

See the [React Email cookbook](./react-email.md) for template structure, preview,
plain-text fallbacks, and edge rendering.

## Edge and Workers

`Client.layerFetch` runs through the platform `globalThis.fetch`.
The same send works in Bun, Node with fetch, Vercel Edge, and Cloudflare
Workers.
For Workers, pass the key from the Worker environment.
Build the layer at the request or module boundary.

```ts
import { Effect } from "effect";
import { Client, Email } from "samva/effect";

export default {
  async fetch(_request: Request, env: { SAMVA_API_KEY: string }) {
    const program = Email.send({
      to: "ada@example.com",
      subject: "Hello from the edge",
      html: "<p>Hello from the edge.</p>",
      text: "Hello from the edge.",
    }).pipe(Effect.provide(Client.layerFetch({ apiKey: env.SAMVA_API_KEY })));

    const message = await Effect.runPromise(program);
    return Response.json({ id: message.id, status: message.status });
  },
};
```

## Runnable example

The [`examples/effect-sdk`](../examples/effect-sdk) app includes:

- `src/send.ts` is a first-send script with `Email.send` and `Client.layerFetch`.
- `src/server.ts` is a fetch handler with `Client.layerFetch`.
  It maps semantic tagged errors and `catchAuthError` to HTTP responses.
  It uses `isRetryable` to split exhausted-retry failures from unexpected ones.
- Loud `SAMVA_API_KEY` validation.
- Escaping for user text before it is placed into HTML.

## FAQ

**Why is there no `from`?** The `from` field is optional. Omit it and Samva
sends from the verified sender on your account. Configure senders at
[samva.dev](https://samva.dev).

**Where should the API key live?** Only on the server or in an edge environment
binding. Do not expose it to browser code.

**Do I need to add my own retries?** No.
Reads and sends retry on throttling and transient failures out of the box.
Sends stay safe under retry because they carry an `Idempotency-Key`.
Wrapping a call in `Effect.retry` nests your policy on top of the built-in one.
Use `Retry.layer` to change it instead.

**Can I receive webhooks here too?** Receiving and verifying Samva webhooks is a
separate concern. Use the `samva/webhooks` SDK export or the webhook cookbook
when you need inbound delivery events.

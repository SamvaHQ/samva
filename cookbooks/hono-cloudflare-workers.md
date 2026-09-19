# Hono on Cloudflare Workers with Samva

Send email from a [Hono](https://hono.dev) app on
[Cloudflare Workers](https://developers.cloudflare.com/workers/) with Samva.
The Samva SDK uses `fetch`. The send path runs on `workerd` without SMTP,
`nodemailer`, Node built-ins, or `nodejs_compat`.

## Setup

```sh
bun add hono samva
bun add -d wrangler @cloudflare/workers-types typescript
```

Store secrets in Workers bindings. In production, put the key with Wrangler:

```sh
wrangler secret put SAMVA_API_KEY
```

For local development, keep a `.dev.vars` file next to `wrangler.jsonc`:

```sh
SAMVA_API_KEY="samva_sk_live_..."
```

Configure the Worker with a module entrypoint. You do not need `nodejs_compat`.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "hono-cloudflare-workers-samva",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-29",
}
```

## The Worker seam

Hono's app object is the Worker entrypoint. Export it with `export default app`.
Cloudflare passes `request`, `env`, and `ctx` to `app.fetch`.
Hono exposes `env` as `c.env` inside handlers.

```ts
import { Hono } from "hono";
import { createClient, SamvaApiError, SamvaTransportError } from "samva";

type Bindings = {
  SAMVA_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("samva + hono on workers"));

export default app;
```

Create the Samva client inside the handler from `c.env`.
Do not read `process.env`.
Do not build a module-top client from a Worker secret.

## Route handler send

The Promise client returns the decoded message. It throws on failure.
Catch `SamvaApiError` and `SamvaTransportError`. Use `client.raw` only when you
need the generated envelope.

```ts
import { Hono } from "hono";
import { createClient, SamvaApiError, SamvaTransportError } from "samva";

type Bindings = {
  SAMVA_API_KEY: string;
};

type SendRequestBody = {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
};

const app = new Hono<{ Bindings: Bindings }>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

app.post("/send", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Expected a JSON object." }, 400);
  }

  const { to, subject, html, text } = body as SendRequestBody;
  const recipientEmail = readString(to);
  const emailSubject = readString(subject);

  if (!recipientEmail || !emailSubject) {
    return c.json({ error: "to and subject are required" }, 400);
  }

  const apiKey = c.env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not configured for this Worker.");
  }

  const samva = createClient({ apiKey });
  try {
    const message = await samva.messages.send({
      to: [{ email: recipientEmail }],
      channel: "email",
      email: {
        subject: emailSubject,
        html: readString(html) || "<p>Hello from Hono on Cloudflare Workers.</p>",
        text: readString(text) || undefined,
      },
    });

    return c.json({ ok: true, id: message.id });
  } catch (error) {
    if (!(error instanceof SamvaApiError) && !(error instanceof SamvaTransportError)) throw error;

    return c.json({ ok: false, error: error.message }, 502);
  }
});

export default app;
```

The `from` field is optional; omit it and Samva sends from the verified sender
on your account.

## Edge-native send path

This route stays inside the Workers runtime.

- Hono reads JSON and returns `Response` objects through Web APIs.
- The Samva SDK sends over `fetch`.
- The API key comes from a Worker secret binding.
- The path needs no SMTP sockets, Node `crypto`, Node `fs`, or compatibility flags.

## Await or waitUntil

For user-facing sends, await `samva.messages.send(...)`.
Return the message to the caller. That puts delivery API errors in the HTTP response.

Use `c.executionCtx.waitUntil(...)` only when the request should return first.
Typical cases are analytics notices and webhook side effects.

```ts
app.post("/send-background", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Expected a JSON object." }, 400);
  }

  const { to, subject, html } = body as SendRequestBody;
  const recipientEmail = readString(to);
  const emailSubject = readString(subject);

  if (!recipientEmail || !emailSubject) {
    return c.json({ error: "to and subject are required" }, 400);
  }

  const apiKey = c.env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not configured for this Worker.");
  }

  const samva = createClient({ apiKey });
  c.executionCtx.waitUntil(
    samva.messages.send({
      to: [{ email: recipientEmail }],
      channel: "email",
      email: {
        subject: emailSubject,
        html: readString(html) || "<p>Hello from Hono on Cloudflare Workers.</p>",
      },
    }),
  );

  return c.json({ accepted: true }, 202);
});
```

`waitUntil` extends work after the response. The client will not see send errors.
Keep the awaited path as the default for forms, admin actions, and API calls.

## React Email on Workers

React Email's render package has an edge build for `workerd`.
Render to HTML. Derive a text fallback. Then send the strings with Samva.

```sh
bun add @react-email/render react react-dom
```

```tsx
import { render, toPlainText } from "@react-email/render";
import { Hono } from "hono";
import { createClient, SamvaApiError, SamvaTransportError } from "samva";
import WelcomeEmail from "./emails/welcome-email";

type Bindings = {
  SAMVA_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post("/welcome", async (c) => {
  const html = await render(<WelcomeEmail name="Ada" />);

  const apiKey = c.env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not configured for this Worker.");
  }

  const samva = createClient({ apiKey });
  try {
    const message = await samva.messages.send({
      to: [{ email: "ada@example.com" }],
      channel: "email",
      email: {
        subject: "Welcome",
        html,
        text: toPlainText(html),
      },
    });

    return c.json({ ok: true, id: message.id });
  } catch (error) {
    if (!(error instanceof SamvaApiError) && !(error instanceof SamvaTransportError)) throw error;

    return c.json({ ok: false, error: error.message }, 502);
  }
});
```

For components, Tailwind, preview workflows, and text strategies, use the
[React Email cookbook](./react-email.md).

## Webhook receiver shape

When you receive Samva webhooks in a Worker, read the raw body first.
Do not parse JSON before verification. Use the `samva/webhooks` SDK subpath.

```ts
import { verifyRequest, WebhookVerificationError } from "samva/webhooks";

app.post("/webhooks/samva", async (c) => {
  const secret = c.env.SAMVA_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("SAMVA_WEBHOOK_SECRET is not configured for this Worker.");
  }

  try {
    const verified = await verifyRequest(c.req.raw, secret);
    return c.json({ ok: true, id: verified.id, type: verified.event.type }, 202);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return c.json({ ok: false, error: "Invalid webhook signature." }, 400);
    }
    throw error;
  }
});
```

`verifyRequest` reads the untouched raw request, so do not parse the body first.
Reject unverified events with a 400 and act only on the verified `event`.

## FAQ

**Why no `from`?** The `from` field is optional. Omit it and Samva sends from
the verified sender on your account; your Worker only supplies recipients and
email content unless it needs to select a specific verified sender.

**Can I use `process.env.SAMVA_API_KEY`?** Not on Workers.
Put the secret in Wrangler and read `c.env.SAMVA_API_KEY` inside the handler.

**Should sends use `waitUntil`?** Usually no.
Await the send when a user or API caller needs to know whether it worked.
Use `waitUntil` for background side effects where the response should return now.

**How do I send many emails?** Put the work behind a queue or batch process.
Keep the request handler focused on one user-facing send.

**Can I use the Effect-native SDK?** Yes.
`samva/effect` can run with a fetch-backed HTTP client.
This cookbook uses the Promise client because it is the shortest Hono route shape.

## Example

See the runnable
[`hono-cloudflare-workers` example](../examples/hono-cloudflare-workers) for a
complete Worker with `wrangler.jsonc`, `.dev.vars.example`, `POST /send`, and a
Samva webhook receiver stub.

# TanStack Start with Samva

Send transactional email from a TanStack Start app with Samva.
Use `createServerFn` for in-app forms. Use a server route for raw HTTP triggers.
The Samva SDK uses `fetch`. The same send path works in Node and edge SSR
runtimes such as Cloudflare Workers when you keep API keys on the server.

## Setup

```sh
bun add samva zod
```

Add React Email when you want component templates:

```sh
bun add react-email react react-dom
```

Set a server-only key. Do not prefix it with `VITE_`.
Client-side env vars are public in TanStack Start.

```sh
SAMVA_API_KEY=samva_sk_live_your_key_here
```

Create a tiny server-only helper:

```ts
// src/lib/samva.ts
import "@tanstack/react-start/server-only";
import { createClient } from "samva";

export function getSamva() {
  const apiKey = process.env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not set");
  }

  return createClient({ apiKey });
}
```

Build the client inside a handler or another per-request callback.
On Cloudflare Workers and other edge SSR runtimes, `process.env` is injected per
request. A module-scope `process.env.SAMVA_API_KEY` read can be `undefined`.

## Send from a server function

Use a server function for app-owned mutations such as contact forms, invitations,
and transactional sends from your UI.

```ts
// src/functions/send-email.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSamva } from "~/lib/samva";

const sendEmailInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const sendEmail = createServerFn({ method: "POST" })
  .validator(sendEmailInput)
  .handler(async ({ data }) => {
    const samva = getSamva();
    const html = `<p>${escapeHtml(data.message).replaceAll("\n", "<br />")}</p>`;

    await samva.messages.send({
      to: [{ email: data.to }],
      channel: "email",
      email: {
        subject: data.subject,
        html,
        text: data.message,
      },
    });

    return { ok: true };
  });
```

The handler context is `{ data, context, method, serverFnMeta }`.
There is no `signal` field on that context.
`validator()` accepts Standard Schema validators. Zod, Valibot, and ArkType all
fit. This recipe uses Zod because it is common and direct.
Older TanStack Start examples may show `.inputValidator()`.
Current Start builds warn in favor of `.validator()`.

`samva.messages.send()` returns the decoded message and throws typed SDK errors.
For a form flow, return your own small app response such as `{ ok: true }`.
Return fields from the message only when your UI needs them.

## Call it from a form

```tsx
// src/routes/index.tsx
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { sendEmail } from "~/functions/send-email";

export function ContactForm() {
  const send = useServerFn(sendEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);

        setStatus("sending");
        setError(null);

        try {
          await send({
            data: {
              to: String(form.get("to") ?? ""),
              subject: String(form.get("subject") ?? ""),
              message: String(form.get("message") ?? ""),
            },
          });
          setStatus("sent");
          formElement.reset();
        } catch (err) {
          setStatus("idle");
          setError(err instanceof Error ? err.message : "Unable to send email");
        }
      }}
    >
      <input name="to" type="email" required />
      <input name="subject" required />
      <textarea name="message" required />
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {status === "sent" ? <p>Email sent.</p> : null}
    </form>
  );
}
```

For multi-step or heavily validated forms, pair the same server function with
`@tanstack/react-form`. The send boundary stays the same.

## Add a server route

Use a server route when an external system needs to POST to your app.
Use it also when you want a raw HTTP endpoint instead of server-function RPC.

```ts
// src/routes/api/send.ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getSamva } from "~/lib/samva";

const sendRouteInput = z
  .object({
    to: z.string().email(),
    subject: z.string().min(1),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .refine((value) => value.html || value.text, {
    message: "html or text is required",
  });

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sendToken = process.env.SAMVA_SEND_TOKEN;
        if (!sendToken) {
          return Response.json({ error: "Send endpoint token is not configured" }, { status: 500 });
        }

        if (request.headers.get("authorization") !== `Bearer ${sendToken}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json().catch(() => null);
        const parsed = sendRouteInput.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: "Invalid send payload" }, { status: 400 });
        }

        const body = parsed.data;
        const text = body.text;
        const html =
          body.html ?? (text ? `<p>${escapeHtml(text).replaceAll("\n", "<br />")}</p>` : undefined);
        const samva = getSamva();

        await samva.messages.send({
          to: [{ email: body.to }],
          channel: "email",
          email: {
            subject: body.subject,
            ...(html ? { html } : {}),
            ...(text ? { text } : {}),
          },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
```

A server function is already an RPC endpoint.
Keep the bearer-token check. Or replace it with your session middleware.
Add rate limits before you accept production traffic.
Do not rely on a UI route `beforeLoad` to protect a mutation.

TanStack Start also exposes request and response helpers from
`@tanstack/react-start/server`, such as `getRequestHeader()` and
`setResponseStatus()`, when you need framework-managed response state.

## Render React Email

React Email renders a component to the `html` string Samva sends.
Keep the full template work in your email files.
Pass the rendered result to `samva.messages.send()`.

```tsx
import { render, toPlainText } from "react-email";

import WelcomeEmail from "~/emails/welcome";
import { getSamva } from "~/lib/samva";

const html = await render(<WelcomeEmail name="Ada" />);
const text = toPlainText(html);

await getSamva().messages.send({
  to: [{ email: "ada@example.com" }],
  channel: "email",
  email: { subject: "Welcome", html, text },
});
```

You can also derive text with a second render:

```tsx
const text = await render(<WelcomeEmail name="Ada" />, { plainText: true });
```

For deeper template structure, preview workflows, and Tailwind examples, see the
[React Email cookbook](./react-email.md).

## Edge and Workers notes

The Samva SDK uses `fetch`. React Email's edge render path avoids Node-only
runtime APIs. A TanStack Start app on Cloudflare Workers can render and send in
the same request path.

Build the Samva client per request. Do that inside `.handler()`, middleware
`.server()`, or a server route handler.
Do not build a module-scope client from `process.env.SAMVA_API_KEY` in a
Workers-targeted app.

The official TanStack `start-basic-cloudflare` example is the right reference
for framework deployment shape. This cookbook focuses on the Samva send seam.

## Effect aside

Promise APIs are the default. The SDK also exposes `samva/effect` for Effect
applications.

```ts
import { Effect } from "effect";
import { Client, Email } from "samva/effect";

const program = Email.send({
  to: "ada@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
}).pipe(Effect.provide(Client.layerFetch({ apiKey: process.env.SAMVA_API_KEY! })));
```

Keep the same server-only and per-request env rules when you run this from
TanStack Start.

## FAQ

**Server function or server route?** Use a server function for app UI mutations
called with `useServerFn`. Use a server route for raw HTTP integrations and
external triggers.

**Where is `from`?** `from` is optional. Omit it and Samva sends from the verified sender on
your account.

**Can I put the key in `VITE_SAMVA_API_KEY`?** No. `VITE_` variables are client
visible. Use `process.env.SAMVA_API_KEY` from server-only code.

**What should fail loudly?** Invalid form input should fail validation.
A missing `SAMVA_API_KEY` should throw inside the handler.
Do not silently skip sends or stub them in production code.

**What about webhooks?** Webhook receiving and signature verification are owned
by `samva/webhooks`. The TanStack Start server route shape above is the raw HTTP
seam. It is not webhook verification by itself.

**What about bulk sends?** Put high-volume or retry-heavy work behind a queue.
Call Samva from the worker. This cookbook covers request and response sends.

## Runnable example

See [`examples/tanstack-start-transactional`](../examples/tanstack-start-transactional)
for a self-contained TanStack Start app with both send flows.

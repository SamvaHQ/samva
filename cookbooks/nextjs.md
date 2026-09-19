# Send email from Next.js with Samva

Use the `samva` SDK from Next.js server code.
Use Server Actions for forms. Use Route Handlers for HTTP endpoints.
Use Pages Router API routes for older apps.
Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

## Setup

```sh
bun add samva server-only
```

Create a server-only client module. Never import this file from a Client
Component.

```ts
// lib/samva.ts
import "server-only";

import { createClient } from "samva";

const apiKey = process.env.SAMVA_API_KEY;
if (!apiKey) {
  throw new Error("SAMVA_API_KEY is not set.");
}

export const samva = createClient({ apiKey });
```

Add the key to `.env.local`:

```sh
SAMVA_API_KEY=samva_sk_live_...
```

Escape user-controlled strings before you put them in HTML:

```ts
// lib/email-html.ts
export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
```

## Server Action

Server Actions are the best default for in-app forms.
The browser can submit a `<form>` directly to server code.

```ts
// app/contact/actions.ts
"use server";

import { samva } from "../../lib/samva";
import { escapeHtml } from "../../lib/email-html";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function sendContactEmail(
  _state: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!email || !message) {
    return { status: "error", message: "Email and message are required." };
  }

  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  try {
    await samva.messages.send({
      to: [{ email }],
      channel: "email",
      email: {
        subject: "Thanks for contacting us",
        html: `<p>Thanks for reaching out.</p><p>${safeMessage}</p>`,
        text: `Thanks for reaching out.\n\n${message}`,
      },
    });
  } catch {
    return { status: "error", message: "Failed to send message. Please try again." };
  }

  return { status: "success", message: "Message sent." };
}
```

Use `useActionState` for the form state. Use `useFormStatus` for the pending
button state.

```tsx
// app/contact/contact-form.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { sendContactEmail, type ContactFormState } from "./actions";

const initialState: ContactFormState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "Sending..." : "Send"}</button>;
}

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactEmail, initialState);

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <SubmitButton />
      {state.message ? <p>{state.message}</p> : null}
    </form>
  );
}
```

## Route Handler

Use a Route Handler when another service or client needs a JSON endpoint.
The Promise client returns the decoded message and throws on failure.

```ts
// app/api/send/route.ts
import { samva } from "../../../lib/samva";
import { escapeHtml } from "../../../lib/email-html";

export const runtime = "edge";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    message?: unknown;
  } | null;
  if (!body) {
    return Response.json({ ok: false, error: "Expected a JSON object." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!email || !message) {
    return Response.json({ ok: false, error: "email and message are required" }, { status: 400 });
  }

  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  try {
    const messageResult = await samva.messages.send({
      to: [{ email }],
      channel: "email",
      email: {
        subject: "Thanks for contacting us",
        html: `<p>Thanks for reaching out.</p><p>${safeMessage}</p>`,
        text: `Thanks for reaching out.\n\n${message}`,
      },
    });
    return Response.json({ ok: true, id: messageResult.id });
  } catch {
    return Response.json({ ok: false, error: "Failed to send message." }, { status: 502 });
  }
}
```

The SDK is fetch-based, so the send path can run in the Edge runtime.
Keep Node-only dependencies, database drivers, and filesystem access out of edge
handlers.

## React Email

Render React Email to HTML. Then pass the strings to Samva.
The deep templating workflow lives in the [React Email cookbook](./react-email.md).

```tsx
import { render, toPlainText } from "react-email";
import { samva } from "./lib/samva";
import WelcomeEmail from "./emails/welcome";

const html = await render(<WelcomeEmail name="Ada" />);
const text = toPlainText(html);

await samva.messages.send({
  to: [{ email: "ada@example.com" }],
  channel: "email",
  email: { subject: "Welcome", html, text },
});
```

## Pages Router

If your app still uses the Pages Router, keep the same server-only Samva client.
Call it from `pages/api`.

```ts
// pages/api/send.ts
import type { NextApiRequest, NextApiResponse } from "next";

import { escapeHtml } from "../../lib/email-html";
import { samva } from "../../lib/samva";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  const { email, message } = req.body as { email?: unknown; message?: unknown };
  if (typeof email !== "string" || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "email and message are required" });
  }

  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  try {
    const messageResult = await samva.messages.send({
      to: [{ email }],
      channel: "email",
      email: {
        subject: "Thanks for contacting us",
        html: `<p>Thanks for reaching out.</p><p>${safeMessage}</p>`,
        text: `Thanks for reaching out.\n\n${message}`,
      },
    });

    return res.status(200).json({ ok: true, id: messageResult.id });
  } catch {
    return res.status(502).json({ ok: false, error: "failed to send email" });
  }
}
```

## Edge vs Node

Samva's client uses `fetch`. Sending email works from Next.js Node routes,
Edge Route Handlers, Vercel Edge functions, Cloudflare Workers, and other Web
runtime hosts. Runtime compatibility is usually decided by the code around the
send.

- Choose Edge when your handler only uses Web APIs and fetch-based dependencies.
- Choose Node when your handler needs Node-only database drivers, filesystem
  access, SMTP-over-TCP, or other Node built-ins.
- Do not send email during static generation or from middleware or proxy code.

## FAQ

**Server Action or Route Handler?** Use a Server Action for forms inside your
Next.js app. Use a Route Handler for JSON endpoints, webhooks, or calls from
other services.

**Can I fire-and-forget?** Await transactional sends so the UI or API caller
knows whether Samva accepted the message. For bulk or post-response work, enqueue
a job or use the host's background primitive such as `waitUntil` or `after`.

**Where is `from`?** `from` is optional. Omit it and Samva sends from the verified sender on your account at
[samva.dev](https://samva.dev).

**What about webhooks?** Receiving and verifying Samva webhooks is a separate
flow. See the [webhooks guide](https://samva.dev/docs/integrations/webhooks)
and the `samva/webhooks` SDK subpath.

## Runnable example

See [`examples/nextjs-transactional`](../examples/nextjs-transactional) for a
self-contained App Router app with a contact form and `/api/send` endpoint.

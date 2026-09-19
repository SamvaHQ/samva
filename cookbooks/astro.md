# Astro with Samva

Use Astro to collect email input and send it with the `samva` SDK from server
code.
The primary path is an [Astro Action](https://docs.astro.build/en/guides/actions/)
for progressively enhanced forms.
A plain API endpoint is the right alternative for headless JSON clients.

Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.
The SDK is `fetch`-based.
The same send code runs under `@astrojs/cloudflare`, `@astrojs/node`, and other
SSR adapters.

## Setup

Install the SDK and add an SSR adapter.
The Cloudflare adapter proves the edge runtime path.
Use `@astrojs/node` if you want the simplest Node server.

```sh
bun add samva
bunx astro add cloudflare
```

For typed server secrets, configure `astro:env` in `astro.config.mjs`:

```js
import cloudflare from "@astrojs/cloudflare";
import { defineConfig, envField } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  env: {
    schema: {
      SAMVA_API_KEY: envField.string({ context: "server", access: "secret" }),
    },
  },
});
```

Then keep the Samva client in a module imported only from server code:

```ts
// src/lib/samva.ts
import { SAMVA_API_KEY } from "astro:env/server";
import { createClient } from "samva";

export const samva = createClient({ apiKey: SAMVA_API_KEY });
```

Astro does not have a `server-only` import guard like Next.js.
Keep this module off client islands.
Import it only from Actions, API endpoints, middleware, or `.astro` frontmatter
that runs on the server.

For a smaller setup, you can read `import.meta.env.SAMVA_API_KEY` from server
code instead.
Do not use a `PUBLIC_` prefix for API keys.
Public variables are client-exposed.

## Send from an Astro Action

Actions are the best default for contact forms and app forms.
Astro owns validation, progressive enhancement, and the post-submit result.

```ts
// src/actions/index.ts
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { samva } from "../lib/samva";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const server = {
  send: defineAction({
    accept: "form",
    input: z.object({
      email: z.email(),
      subject: z.string().min(1),
      message: z.string().min(1),
    }),
    handler: async ({ email, message, subject }) => {
      // Actions are public endpoints. Check auth, rate limits, and tenant
      // permissions here before sending.
      try {
        await samva.messages.send({
          to: [{ email }],
          channel: "email",
          email: {
            subject,
            html: `<p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>`,
            text: message,
          },
        });
      } catch {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send email.",
        });
      }

      return { ok: true };
    },
  }),
};
```

Use the action directly from an on-demand page:

```astro
---
import { actions } from "astro:actions";

const result = Astro.getActionResult(actions.send);
---

<form method="POST" action={actions.send}>
  <input type="email" name="email" required />
  <input name="subject" required />
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>

{result?.data?.ok && <p>Email sent.</p>}
{result?.error && <p>{result.error.message}</p>}
```

`result.data` and `result.error` here are Astro Action result fields.
They are not the Samva Promise client envelope.
Client islands can call the same action with `await actions.send(input)`.
Server code can use `Astro.callAction(actions.send, input)`.

## Send from an API endpoint

Use an API endpoint when another service, a fetch call, or a non-Astro frontend
posts JSON to your app.

```ts
// src/pages/api/send.ts
import type { APIRoute } from "astro";
import { z } from "astro/zod";

import { samva } from "../../lib/samva";

export const prerender = false;

const emailInput = z.email();

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON request body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    !("subject" in body) ||
    !("message" in body) ||
    typeof body.email !== "string" ||
    typeof body.subject !== "string" ||
    typeof body.message !== "string" ||
    !emailInput.safeParse(body.email).success ||
    body.email.length === 0 ||
    body.subject.length === 0 ||
    body.message.length === 0
  ) {
    return Response.json(
      { error: "email, subject, and message are required string fields." },
      { status: 400 },
    );
  }

  try {
    await samva.messages.send({
      to: [{ email: body.email }],
      channel: "email",
      email: {
        subject: body.subject,
        html: `<p>${escapeHtml(body.message).replaceAll("\n", "<br />")}</p>`,
        text: body.message,
      },
    });
  } catch {
    return Response.json({ error: "Failed to send email." }, { status: 502 });
  }

  return Response.json({ ok: true });
};
```

`prerender = false` keeps this route on demand if the rest of your site is
static.
If you set `output: "server"` globally, all routes are server-rendered by
default.

## Edge and Workers

Samva uses `fetch`, not SMTP or Node-only modules.
The same send call works in Cloudflare Workers through `@astrojs/cloudflare`.

```js
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
});
```

Use `.dev.vars` for local Worker secrets:

```sh
SAMVA_API_KEY=samva_sk_live_...
```

If you do not need Workers, `@astrojs/node` is a straightforward alternative.
The Samva code does not change.

## Render React Email in Astro

For component-based templates, render React Email to HTML and pass the string to
Samva.

```tsx
import { render } from "@react-email/render";
import WelcomeEmail from "../emails/welcome";

const html = await render(<WelcomeEmail name="Ada" />);

await samva.messages.send({
  to: [{ email }],
  channel: "email",
  email: { subject: "Welcome", html },
});
```

Import from the bare `@react-email/render` package.
Its exports map selects the Workers-safe build under `workerd` and edge
conditions.
There is no `/edge` subpath to import.
See the [React Email cookbook](./react-email.md) for Tailwind, preview, export,
and plain-text fallback patterns.

## Receive Samva webhooks

An Astro webhook receiver is an API endpoint.
Read the raw body before parsing so the same bytes can be verified by a real
signature verifier.

```ts
// src/pages/api/webhooks/samva.ts
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();

  // Warning: this example does not verify the signature. Do not trust events
  // from the public internet in production until you verify them with the
  // `samva/webhooks` helper.
  let event: unknown;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof event !== "object" ||
    event === null ||
    !("type" in event) ||
    typeof event.type !== "string"
  ) {
    return Response.json({ error: "Webhook event type is required." }, { status: 400 });
  }

  switch (event.type) {
    case "message.delivered":
      // update delivery state
      break;
    case "message.failed":
      // alert or retry
      break;
    default:
      break;
  }

  return Response.json({ ok: true });
};
```

This is only the route shape.
Do not hand-roll a signature algorithm or ship an always-passing verifier.
Use `samva/webhooks` for production verification.

## FAQ

**Action or endpoint?** Use Actions for Astro-owned forms and endpoints for JSON
clients.
Actions are still public endpoints.
Do the same auth, rate-limit, and abuse checks you would do in an API route.

**Can I send from a prerendered route?** No.
Email is runtime work.
Use `output: "server"` or `export const prerender = false`.

**Do I need an adapter?** Yes for runtime sends in production.
Use `@astrojs/cloudflare` for Workers or `@astrojs/node` for a Node server.

**Where does the API key live?** Server-only env.
Prefer `astro:env/server` with an
`envField.string({ context: "server", access: "secret" })` schema.
Never use `PUBLIC_SAMVA_API_KEY`.

**Why is `from` optional?** Omit it and Samva sends from the verified sender on your account at
[samva.dev](https://samva.dev).

**Can this run on Cloudflare Workers?** Yes.
The SDK is `fetch`-based.
React Email rendering works from the bare `@react-email/render` import under
Workers.

## Example

Clone the [Astro email example](../examples/astro-email) for a complete
Cloudflare-backed app with a contact form Action and `/api/send` endpoint.

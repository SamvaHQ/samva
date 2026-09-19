# Send email from SvelteKit with Samva

Use the `samva` SDK from SvelteKit server code.
Use form actions for in-app forms. Use `+server.ts` endpoints for JSON clients.
Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

## Setup

```sh
bun add samva
```

Add React Email only when you want component templates:

```sh
bun add react-email react react-dom
```

Set a server-only key:

```sh
SAMVA_API_KEY=samva_sk_live_your_key_here
SAMVA_SEND_TOKEN=replace-with-a-random-route-token
```

Create a Samva client helper in `src/lib/server`.
Modules under `src/lib/server` and `$env/*/private` are server-only by
construction. Importing either from client code is a build error.

```ts
// src/lib/server/samva.ts
import { env } from "$env/dynamic/private";
import { createClient } from "samva";
import type { SamvaClient } from "samva";

let samva: SamvaClient | undefined;

export function getSamva(): SamvaClient {
  const apiKey = env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not set.");
  }

  return (samva ??= createClient({ apiKey }));
}
```

Escape user-controlled strings before putting them in HTML:

```ts
const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
```

## Form action

Use a form action for app-owned forms.
It works without client JavaScript.
You can progressively enhance it with `use:enhance`.

```ts
// src/routes/contact/+page.server.ts
import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";

import { getSamva } from "$lib/server/samva";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const field = (formData: FormData, name: string): string => String(formData.get(name) ?? "").trim();

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = field(formData, "email");
    const message = field(formData, "message");

    if (!email || !message) {
      return fail(400, { error: "Email and message are required." });
    }

    await getSamva().messages.send({
      to: [{ email }],
      channel: "email",
      email: {
        subject: "Thanks for contacting us",
        html: `<p>Thanks for reaching out.</p><p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>`,
        text: `Thanks for reaching out.\n\n${message}`,
      },
    });

    return { success: true };
  },
} satisfies Actions;
```

Render the action result from the page `form` prop:

```svelte
<!-- src/routes/contact/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";

  let { form } = $props<{ form?: { success?: boolean; error?: string } }>();
  let pending = $state(false);
</script>

<form
  method="POST"
  use:enhance={() => {
    pending = true;
    return async ({ update }) => {
      await update();
      pending = false;
    };
  }}
>
  <input name="email" type="email" required />
  <textarea name="message" required></textarea>
  <button disabled={pending}>{pending ? "Sending..." : "Send"}</button>
</form>

{#if form?.error}<p role="alert">{form.error}</p>{/if}
{#if form?.success}<p>Email accepted by Samva.</p>{/if}
```

## `+server.ts` endpoint

Use a `+server.ts` endpoint when a service or client needs to POST JSON to your
app. Keep auth and rate limits in the endpoint or surrounding hooks.

```ts
// src/routes/api/send/+server.ts
import { env } from "$env/dynamic/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { getSamva } from "$lib/server/samva";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const POST: RequestHandler = async ({ request }) => {
  const sendToken = env.SAMVA_SEND_TOKEN;
  if (!sendToken) {
    error(500, "SAMVA_SEND_TOKEN is not configured.");
  }

  if (request.headers.get("authorization") !== `Bearer ${sendToken}`) {
    error(401, "Unauthorized.");
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    error(400, "Expected a JSON object.");
  }

  const to = readString(body.to);
  const subject = readString(body.subject);
  const message = readString(body.message);

  if (!to || !subject || !message) {
    error(400, "to, subject, and message are required.");
  }

  await getSamva().messages.send({
    to: [{ email: to }],
    channel: "email",
    email: {
      subject,
      html: `<p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>`,
      text: message,
    },
  });

  return json({ ok: true });
};
```

The endpoint awaits `samva.messages.send()`.
Do not return success before the send promise settles unless you have queued the
work elsewhere.

## Edge and Cloudflare Workers

The Samva SDK uses `fetch`.
The send path works with `@sveltejs/adapter-cloudflare` and other Web runtime
hosts.
The code around the send decides compatibility.
Avoid Node-only database drivers, filesystem access, SMTP-over-TCP, and
`node:crypto` in Workers handlers.

Prefer `$env/dynamic/private` for runtime secrets.
Use `$env/static/private` only when the key is present during build and
typecheck.
The SvelteKit Cloudflare adapter recommends `$env` modules for environment
variables.
If your key is available only as a Worker binding, construct the client per
request from `platform.env` instead of importing the module-scope client.

```ts
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "samva";

export const POST: RequestHandler = async ({ platform }) => {
  const apiKey = platform?.env.SAMVA_API_KEY;
  if (!apiKey) {
    error(500, "SAMVA_API_KEY is not configured for this Worker.");
  }

  const samva = createClient({ apiKey });
  // await samva.messages.send(...)
  return json({ ok: true });
};
```

Type the binding in `src/app.d.ts` if you use this fallback:

```ts
declare global {
  namespace App {
    interface Platform {
      env: {
        SAMVA_API_KEY: string;
      };
    }
  }
}
```

## React Email

React Email renders a component to the `html` string Samva sends.
Keep the full template workflow in the [React Email cookbook](./react-email.md).
The SvelteKit seam is render, derive text, then send.

```tsx
import { render, toPlainText } from "react-email";
import WelcomeEmail from "$lib/emails/welcome";
import { getSamva } from "$lib/server/samva";

const html = await render(<WelcomeEmail name="Ada" />);
const text = toPlainText(html);

await getSamva().messages.send({
  to: [{ email: "ada@example.com" }],
  channel: "email",
  email: { subject: "Welcome", html, text },
});
```

## Auth.js magic links

`@auth/sveltekit` email sign-in is another server-side send seam.
Auth.js owns the verification token and magic-link URL. Samva owns delivery.

```ts
// src/auth.ts
import { SvelteKitAuth } from "@auth/sveltekit";

import { getSamva } from "$lib/server/samva";

export const { handle, signIn, signOut } = SvelteKitAuth({
  // adapter: <your database adapter>,
  providers: [
    {
      id: "samva",
      type: "email",
      name: "Email",
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        const { host } = new URL(url);
        const html = `<p><a href="${url}">Sign in to ${host}</a></p>`;
        const text = `Sign in to ${host}\n${url}\n`;

        await getSamva().messages.send({
          to: [{ email: identifier }],
          channel: "email",
          email: { subject: `Sign in to ${host}`, html, text },
        });
      },
    },
  ],
});
```

Auth.js email providers require a user-owned database adapter for verification
token storage.
When you port a Resend or Nodemailer provider, do not pass `provider.from` to
Samva.

For deeper Auth.js wiring and React Email templates, see the
[Auth.js cookbook](./authjs.md).

## FAQ

**Form action or `+server.ts`?** Use a form action for SvelteKit-owned forms.
Use `+server.ts` for JSON clients, external services, and webhook endpoints.

**Where is `from`?** `from` is optional. Omit it and Samva sends from the verified sender on your account at
[samva.dev](https://samva.dev).

**`$env/static/private` or `$env/dynamic/private`?** Use dynamic for cloneable
examples and hosts that inject secrets at runtime.
Use static when the value is available to SvelteKit during build and typecheck
and you want compile-time replacement.
Both are server-only.

**Can I fire-and-forget?** Usually no.
Await transactional sends so the UI or API caller knows whether Samva accepted
the message.
Use a queue or the host's background primitive for non-user-facing work.

**Can I send from `load`?** Do not send from `load`.
It may rerun during navigation, invalidation, or preloading.
Send from actions, endpoints, hooks, or background jobs.

**What about webhooks?** Receiving and verifying Samva webhooks is a separate
flow. See the [webhooks guide](https://samva.dev/docs/integrations/webhooks)
and the `samva/webhooks` SDK subpath.

## Runnable example

See [`examples/sveltekit-transactional`](../examples/sveltekit-transactional)
for a self-contained SvelteKit app with a contact form action and `/api/send`
endpoint.

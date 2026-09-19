# Auth.js with Samva

Send Auth.js and NextAuth magic-link email through Samva.
Own the email provider's `sendVerificationRequest` callback.
Auth.js already has the right seam.
Clone the shape of its HTTP email providers.
Replace the provider API call with `samva.messages.send`.

This is a cookbook, not a package.
Auth.js email providers are plain config objects.
There is no useful `@samva/authjs` wrapper to install.

## Install

```sh
bun add next-auth@beta samva
```

Add React Email only when you want component-based templates:

```sh
bun add react-email react react-dom
```

Keep `SAMVA_API_KEY` server-side only.
Auth.js also needs `AUTH_SECRET`. Generate one with its CLI:

```sh
npx auth secret
```

You do not need `EMAIL_FROM`.
Samva sends from the verified sender on your account.

## Create the provider

`SamvaEmail()` is a custom Auth.js email provider.
The provider-level `from` value is an empty string only because Auth.js' email
provider type still carries that field.
It is never sent to Samva.

```ts
import NextAuth from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import { createClient } from "samva";

const apiKey = process.env.SAMVA_API_KEY;
if (!apiKey) {
  throw new Error("SAMVA_API_KEY is not set.");
}

const samva = createClient({ apiKey });

function SamvaEmail(config: Partial<EmailConfig> = {}): EmailConfig {
  return {
    id: "samva",
    type: "email",
    name: "Email",
    from: "",
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier: to, url }) {
      const { host } = new URL(url);
      const html = `<p><a href="${url}">Sign in to ${host}</a></p>`;
      const text = `Sign in to ${host}\n${url}\n`;

      await samva.messages.send({
        to: [{ email: to }],
        channel: "email",
        email: {
          subject: `Sign in to ${host}`,
          html,
          text,
        },
      });
    },
    options: config,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // adapter: <your database adapter>,
  providers: [SamvaEmail()],
});
```

Auth.js awaits `sendVerificationRequest`.
If `samva.messages.send` rejects, the sign-in attempt fails.
It does not silently pretend the email was sent.

Email providers require a database adapter so Auth.js can store verification
tokens.
Choose the adapter for your application. Samva only handles the send.

## Add the route handler

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

Place that in `app/api/auth/[...nextauth]/route.ts`.

## Trigger sign-in

Call the provider by its `id` from a server action.
Auth.js reads the `email` field from the form data.

```tsx
import { signIn } from "@/auth";

export function SignInForm() {
  return (
    <form
      action={async (formData) => {
        "use server";
        await signIn("samva", formData);
      }}
    >
      <input type="email" name="email" required />
      <button type="submit">Email me a sign-in link</button>
    </form>
  );
}
```

## Template with React Email

For a richer magic-link email, render a React Email component before calling
Samva.
The deep React Email workflow lives in the
[React Email cookbook](./react-email.md).
The Auth.js-specific part is `url` to `html` to `text` to `messages.send`.

```tsx
import { Button, Html, Text } from "react-email";

export function MagicLinkEmail({ host, url }: { host: string; url: string }) {
  return (
    <Html lang="en">
      <Text>Sign in to {host}</Text>
      <Button href={url}>Sign in</Button>
      <Text>If the button does not work, open this link: {url}</Text>
    </Html>
  );
}
```

Then replace the plain string body in `sendVerificationRequest`:

```tsx
import { render, toPlainText } from "react-email";
import { MagicLinkEmail } from "./emails/magic-link";

async sendVerificationRequest({ identifier: to, url }) {
  const { host } = new URL(url);
  const html = await render(<MagicLinkEmail host={host} url={url} />);
  const text = toPlainText(html);

  await samva.messages.send({
    to: [{ email: to }],
    channel: "email",
    email: {
      subject: `Sign in to ${host}`,
      html,
      text,
    },
  });
}
```

`render` is async. `toPlainText` is sync.

## Already on Nodemailer?

If your app already uses the Auth.js Nodemailer provider, you can override its
`sendVerificationRequest` with the same Samva send.

```ts
import { createClient } from "samva";
import Nodemailer from "next-auth/providers/nodemailer";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

Nodemailer({
  // Nodemailer() still requires a server option even when this callback owns delivery.
  server: process.env.EMAIL_SERVER,
  async sendVerificationRequest({ identifier: to, url }) {
    const { host } = new URL(url);
    await samva.messages.send({
      to: [{ email: to }],
      channel: "email",
      email: {
        subject: `Sign in to ${host}`,
        html: `<p><a href="${url}">Sign in to ${host}</a></p>`,
        text: `Sign in to ${host}\n${url}\n`,
      },
    });
  },
});
```

The custom `SamvaEmail()` provider is the better default for Samva-only senders.
There is no SMTP transport to configure.
There is no required `EMAIL_SERVER`.
The send path is `fetch`-based.
Use the Nodemailer override only as a migration bridge when the rest of the app
is already built around that provider.

## Notes and FAQ

**Why no `from` or `EMAIL_FROM`?** The `from` field is optional and defaults to the verified
sender on your account, so this integration does not require one.
The empty provider-level `from` above exists only to satisfy Auth.js' email
provider shape.

**Does this run on the edge?** The Samva send is edge-safe because the SDK is
`fetch`-based.
The database adapter you choose for Auth.js verification-token storage is the
runtime gate.
Many adapters need Node.
Or use the split-config pattern with `auth.config.ts` for edge proxy and
middleware, and full `auth.ts` with the adapter elsewhere.

**What about NextAuth v4?** v4's `EmailProvider` uses the same
`sendVerificationRequest` seam, but the wiring differs.
See the [Auth.js v5 migration guide](https://authjs.dev/getting-started/migrating-to-v5).

**Can I track delivery and bounces?** Use Samva webhooks for delivery events.
The [Samva webhooks docs](https://samva.dev/docs/integrations/webhooks) cover
signature verification and event handling.

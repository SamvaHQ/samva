# Supabase Auth Send Email Hook with Samva

Use a Supabase Auth Send Email Hook when you want Supabase to keep owning
authentication while Samva sends the transactional email.
Supabase calls an HTTP endpoint you control.
That endpoint verifies the signed raw body, renders a template, calls
`samva.messages.send`, and returns an empty `200`.

This replaces Supabase's built-in email and Custom SMTP path for the covered auth
flows.
There is no SMTP host, username, password, or `from` in the Samva send call.
Samva sends from the verified sender on your account.

The runnable example lives in
[`examples/supabase-auth-hook`](../examples/supabase-auth-hook).

## Install

Inside your hook project:

```sh
bun add samva react-email standardwebhooks react react-dom
```

For a Supabase Edge Function, map those imports in `deno.json`:

```json
{
  "imports": {
    "react": "npm:react@19.0.0",
    "react/jsx-runtime": "npm:react@19.0.0/jsx-runtime",
    "react-email": "npm:react-email@6.6.5",
    "samva": "npm:samva@0.5.0",
    "standardwebhooks": "npm:standardwebhooks@1.0.0"
  }
}
```

## Configure the Supabase hook

In `supabase/config.toml`:

```toml
[auth.hook.send_email]
enabled = true
uri = "https://<your-endpoint>"
secrets = "env(SEND_EMAIL_HOOK_SECRET)"
```

For local Supabase CLI development, point the URI at the served Edge Function:

```toml
uri = "http://host.docker.internal:54321/functions/v1/send-email"
```

Set server-only secrets in `supabase/functions/.env` locally or in your hosted
Supabase Function environment:

```sh
SAMVA_API_KEY=samva_sk_live_...
SEND_EMAIL_HOOK_SECRET=v1,whsec_<base64-secret>
SUPABASE_PROJECT_REF=your-project-ref
```

Serve the function with JWT verification disabled:

```sh
supabase functions serve send-email --no-verify-jwt
```

The Auth hook fires before a user JWT exists.
The Edge Function cannot require Supabase JWT auth.

## Verify the request

Read the raw body first.
Standard Webhooks signs the exact bytes Supabase sends.
`JSON.parse` must happen after verification.

```ts
import { Webhook } from "standardwebhooks";

function normalizeSupabaseWebhookSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.startsWith("v1,whsec_")) {
    return trimmed.slice("v1,whsec_".length);
  }
  if (trimmed.startsWith("whsec_")) {
    return trimmed.slice("whsec_".length);
  }
  return trimmed;
}

async function verifyRequest(request: Request, secret: string) {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);
  const webhook = new Webhook(normalizeSupabaseWebhookSecret(secret));

  return webhook.verify(rawBody, headers);
}
```

Return `401` when verification fails.
A valid request continues to dispatch by `email_data.email_action_type`.

## Build the verify link

Use the Supabase Auth verify endpoint and `token_hash`.
Do not use the raw six-digit `token`.

```ts
function buildVerifyURL(emailData: EmailData) {
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to || emailData.site_url,
  });

  return `https://${Deno.env.get("SUPABASE_PROJECT_REF")}.supabase.co/auth/v1/verify?${params}`;
}
```

`signup`, `invite`, `magiclink`, and `recovery` are link-first.
`reauthentication` is OTP-only.
`email_change` can be one email or two emails depending on the project's Secure
Email Change setting.
The example handles both documented token and hash pairs.

## Dispatch the core actions

```tsx
import { render, toPlainText } from "react-email";
import { createClient } from "samva";

import { ConfirmSignup, EmailChange, Invite, MagicLink, Reauth, Recovery } from "./emails";

const samva = createClient({ apiKey: Deno.env.get("SAMVA_API_KEY")! });

async function renderForAction(emailData: EmailData, target: DeliveryTarget) {
  switch (emailData.email_action_type) {
    case "signup": {
      const html = await render(<ConfirmSignup url={target.verifyURL!} />);
      return { subject: "Confirm your email", html, text: toPlainText(html) };
    }
    case "invite": {
      const html = await render(<Invite url={target.verifyURL!} />);
      return { subject: "You're invited", html, text: toPlainText(html) };
    }
    case "magiclink": {
      const html = await render(<MagicLink url={target.verifyURL!} />);
      return { subject: "Your magic link", html, text: toPlainText(html) };
    }
    case "recovery": {
      const html = await render(<Recovery url={target.verifyURL!} />);
      return { subject: "Reset your password", html, text: toPlainText(html) };
    }
    case "email_change": {
      const html = await render(<EmailChange url={target.verifyURL!} otp={target.otp} />);
      return { subject: "Confirm email change", html, text: toPlainText(html) };
    }
    case "reauthentication": {
      const html = await render(<Reauth otp={target.otp!} />);
      return { subject: "Confirm it's you", html, text: toPlainText(html) };
    }
    default:
      throw new Error(`Unhandled email_action_type: ${emailData.email_action_type}`);
  }
}

async function sendAuthEmail(target: DeliveryTarget, rendered: RenderedEmail) {
  await samva.messages.send({
    to: [{ email: target.email }],
    channel: "email",
    email: rendered,
  });
}
```

The default branch is deliberate.
Supabase has notification action types and a bare `email` OTP action.
This recipe rejects them until you add explicit templates.

## Return the right status

Supabase documents an empty `200` response as success.

```ts
return new Response(null, { status: 200 });
```

For bad signatures, return `401`.
For Samva send failures or unsupported action types, return a non-200 response.
Do not claim a special JSON error body unless your project has verified one
against Supabase.

## Templating

Keep the hook minimal.
Render a React Email component to HTML.
Derive the text fallback with `toPlainText`.

```tsx
import { render, toPlainText } from "react-email";

const html = await render(<ConfirmSignup url={verifyURL} />);
const text = toPlainText(html);
```

For richer templates, previews, Tailwind, and shared components, use the
[React Email cookbook](./react-email.md).
This Supabase recipe only owns the hook seam and the action dispatch.

## Choosing the auth guide

- Use this guide for Supabase Auth, where Supabase calls a signed HTTP hook.
- Use the [Better Auth cookbook](./better-auth.md) when your app uses Better Auth
  callbacks directly.
- Use the React Email cookbook when your question is template rendering rather
  than auth-provider wiring.

Official references:

- [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Samva](https://samva.dev)

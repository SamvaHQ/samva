# Better Auth with Samva

`@samva/better-auth` sends Better Auth transactional email through Samva.
It provides callback fragments for manual wiring.
It also provides a `withSamva()` transformer for the common setup.

## Install

```sh
bun add better-auth samva @samva/better-auth
```

Add `@react-email/render` only when your templates return React Email elements:

```sh
bun add @react-email/render react react-dom
```

## Use the transformer

```ts
import { betterAuth } from "better-auth";
import { withSamva } from "@samva/better-auth";

export const auth = betterAuth(
  withSamva(
    {
      emailAndPassword: {
        enabled: true,
      },
    },
    {
      apiKey: process.env.SAMVA_API_KEY!,
      appUrl: process.env.BETTER_AUTH_URL!,
      plugins: {
        emailOTP: true,
        magicLink: true,
      },
    },
  ),
);
```

`withSamva()` fills missing email verification and password reset callbacks.
It fills change-email and delete-account callbacks when those user flows are
already enabled.
It appends only the plugins you enable.
Existing callbacks are preserved.

## Use callback fragments

```ts
import { betterAuth } from "better-auth";
import { emailOTP, magicLink } from "better-auth/plugins";
import { samvaEmail } from "@samva/better-auth";

const samva = samvaEmail({ apiKey: process.env.SAMVA_API_KEY! });

export const auth = betterAuth({
  emailVerification: samva.emailVerification,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: samva.emailAndPassword.sendResetPassword,
  },
  plugins: [emailOTP(samva.plugins.emailOTP), magicLink(samva.plugins.magicLink)],
});
```

## Customize templates

Default templates exist for all eight Better Auth email triggers.

- `verification`
- `resetPassword`
- `changeEmail`
- `deleteAccount`
- `emailOtp`
- `twoFactorOtp`
- `magicLink`
- `organizationInvitation`

Set `appUrl` when you use the default `organizationInvitation` template so the
accept-invitation link is absolute.

Override only the templates you need:

```ts
const samva = samvaEmail({
  apiKey: process.env.SAMVA_API_KEY!,
  templates: {
    resetPassword: ({ user, url }) => ({
      subject: "Reset your password",
      html: `<p>Hi ${user.email}, reset your password <a href="${url}">here</a>.</p>`,
      text: `Reset your password: ${url}`,
    }),
  },
});
```

Template functions may return HTML, `{ subject, html, text }`, or a React Email
element.
React Email rendering is optional.
It uses `@react-email/render` when a template returns an element.

Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

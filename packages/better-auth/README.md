# Samva for Better Auth

`@samva/better-auth` wires Better Auth email callbacks to the Samva SDK. It
covers email verification, password reset, change-email confirmation,
delete-account confirmation, email OTP, two-factor OTP, magic links, and
organization invitations. Requires `samva@^0.26.0`. Only the current SDK minor is
supported while Samva is 0.x.

```ts
import { withSamva } from "@samva/better-auth";
import { betterAuth } from "better-auth";

export const auth = betterAuth(
  withSamva(
    {
      emailAndPassword: { enabled: true },
    },
    {
      apiKey: process.env.SAMVA_API_KEY!,
      appUrl: process.env.BETTER_AUTH_URL!,
      plugins: {
        emailOTP: true,
      },
    },
  ),
);
```

Configure a default sender for auth callbacks; this package has no `from`
option. If no default applies, the SDK throws `FromAddressRequiredError` with
`verifiedDomains`, and the adapter propagates it to the callback caller.

## Callback Fragments

Use `samvaEmail()` when you want to wire Better Auth yourself:

```ts
import { samvaEmail } from "@samva/better-auth";
import { emailOTP, magicLink } from "better-auth/plugins";

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

## Templates

Default HTML templates are included. Override any trigger with a function that
returns HTML, `{ subject, html, text }`, or a React Email element. React Email
rendering requires `@react-email/render` in your app.

Set `appUrl` when you use the default organization invitation template so accept
links are absolute in email clients.

```ts
samvaEmail({
  apiKey: process.env.SAMVA_API_KEY!,
  templates: {
    resetPassword: ({ user, url }) => ({
      subject: "Reset your password",
      html: `<p>Hi ${user.email}, reset your password <a href="${url}">here</a>.</p>`,
    }),
  },
});
```

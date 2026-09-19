# Clerk with Samva

Send Clerk lifecycle and auth email with Samva.
Receive Clerk's signed webhooks. Verify them with Clerk's helper.
Then call the `samva` SDK from server code.

There is no `@samva/clerk` package.
Clerk owns authentication and webhook verification.
Samva sends the email from the verified sender on your Samva account.

## Install

```sh
bun add @clerk/nextjs@^7.5.10 samva server-only
```

Add React Email only if you want component templates:

```sh
bun add @react-email/render @react-email/components react react-dom
```

Use a current Clerk SDK.
The `@clerk/backend` webhook verifier accepted improper signatures in versions
`>=2.0.0` and `<2.4.0`. See GHSA-9mp4-77wg-rwx9.
`@clerk/nextjs@6.23.3` and newer depend on `@clerk/backend >=2.4.0`.
`@clerk/nextjs@^7.5.10` currently depends on `@clerk/backend@^3.8.5`.

Configure server-only environment variables:

```sh
SAMVA_API_KEY=samva_sk_live_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Create a server-only Samva client:

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

In the Clerk Dashboard, create an endpoint for your public route, for example:

```txt
https://app.example.com/api/webhooks/clerk
```

Subscribe to `user.created` for notification email.
Add `email.created` when you enable Clerk custom delivery.

## Keep the webhook route public

Inbound webhooks are signed requests, not signed-in user traffic.
Exclude the webhook route from `auth.protect()` in `clerkMiddleware()`.

```ts
// proxy.ts in Next.js 16+. Use middleware.ts in Next.js 15 and earlier.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/api/webhooks/clerk"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?)).*)"],
};
```

## Send a welcome email on user.created

This is the default mode.
Clerk still sends its own auth emails.
Your app sends lifecycle email such as welcome, onboarding, or account
notifications.

```ts
// app/api/webhooks/clerk/route.ts
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { render, toPlainText } from "@react-email/render";
import type { NextRequest } from "next/server";

import WelcomeEmail from "../../../../emails/welcome";
import { samva } from "../../../../lib/samva";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;

  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Verification failed", { status: 400 });
  }

  switch (event.type) {
    case "user.created": {
      const email =
        event.data.email_addresses.find(
          (address) => address.id === event.data.primary_email_address_id,
        )?.email_address ?? event.data.email_addresses[0]?.email_address;

      if (!email) {
        break;
      }

      const html = await render(
        WelcomeEmail(event.data.first_name ? { firstName: event.data.first_name } : {}),
      );

      await samva.messages.send({
        to: [{ email }],
        channel: "email",
        email: {
          subject: "Welcome",
          html,
          text: toPlainText(html),
        },
      });

      break;
    }
  }

  return new Response("OK", { status: 200 });
}
```

Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

You can also handle `user.updated` and `user.deleted`.
For delete events, do not assume full user fields are present.

## Deliver Clerk auth email with Samva

Clerk can render its auth email templates but stop sending them.
In the Clerk Dashboard, open an email template and turn off Delivered by Clerk.
Clerk then sends your webhook an `email.created` event.
Deliver that rendered email through Samva.

```ts
case "email.created": {
  const to = event.data.to_email_address;
  if (!to) {
    break;
  }

  await samva.messages.send({
    to: [{ email: to }],
    channel: "email",
    email: {
      subject: event.data.subject ?? "Clerk email",
      html: event.data.body ?? undefined,
      text: event.data.body_plain ?? undefined,
    },
  });

  break;
}
```

You can also ignore Clerk's rendered `body` and render your own React Email
template from `event.data.data`.
Clerk documents `otp_code` for verification email.
Other keys vary by template `slug`.
Log the first live `event.data.data` for each slug before you depend on it.

This is where Samva is simpler than most BYO-ESP snippets.
You do not set `from`.
Configure your verified sender once in Samva.

## React Email template

Use React Email as the render step. Then send the strings through Samva.
For the full templating workflow, see the [React Email cookbook](./react-email.md).

```tsx
import { Body, Container, Heading, Html, Preview, Text } from "@react-email/components";

export interface WelcomeEmailProps {
  firstName?: string;
}

export default function WelcomeEmail({ firstName }: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Preview>Welcome to Example</Preview>
      <Body>
        <Container>
          <Heading>Welcome{firstName ? `, ${firstName}` : ""}</Heading>
          <Text>Your account is ready.</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

## Web Request and Workers shape

`verifyWebhook()` accepts the standard `Request`.
The Samva SDK is `fetch`-based.
The same flow works in frameworks that expose a web `Request`, including
Cloudflare Workers and Hono.

```ts
app.post("/api/webhooks/clerk", async (c) => {
  let event;

  try {
    event = await verifyWebhook(c.req.raw, {
      signingSecret: c.env.CLERK_WEBHOOK_SIGNING_SECRET,
    });
  } catch {
    return c.text("Verification failed", 400);
  }

  c.executionCtx.waitUntil(handleClerkEvent(event, c.env.SAMVA_API_KEY));
  return c.text("OK", 200);
});
```

Return `2xx` only after verification succeeds.
Use `waitUntil` only when your runtime and retry policy can tolerate work
continuing after the response.

## FAQ

**Can I parse JSON before verifying?** No.
Pass the original `Request` to `verifyWebhook()`.
Clerk's helper reads the raw body and checks the `svix-id`, `svix-timestamp`,
and `svix-signature` headers.

**What happens on a bad signature?** Return `400`.
Do not acknowledge unsigned or improperly signed events.

**How do I avoid duplicate sends?** Use the `svix-id` header as the idempotency
key in your database or queue. Svix retries non-`2xx` responses.

**Should the route be behind Clerk auth?** No.
Keep it public in `clerkMiddleware()` and rely on webhook signature
verification.

**Is this like Better Auth?** No.
Better Auth gives you email callbacks to fill.
Clerk owns the flow and POSTs signed webhook events to your route.

**Should I use `@samva/webhooks` here?** No.
`@samva/webhooks` verifies webhooks emitted by Samva.
Clerk webhook verification is owned by Clerk and Svix.

See the runnable [`clerk-webhook` example](../examples/clerk-webhook).

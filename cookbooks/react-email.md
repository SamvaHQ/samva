# React Email with Samva

[React Email](https://react.email) gives you a React component model for HTML
email. You get typed props, reusable components, and Tailwind instead of
hand-written table markup.
Samva is the `samva` entry in its provider matrix.
Render a template to HTML. Then send it with the [Samva](https://samva.dev) SDK.

React Email is your dependency. It renders. Samva sends the rendered string.
Neither locks you into the other.

## Setup

```sh
bun add react-email react react-dom samva
```

`react-email` is the canonical v6 package.
One install gives you the components such as `<Tailwind>` and `<Button>`,
the `render` and `toPlainText` helpers, and the `email` CLI.
Keep your `SAMVA_API_KEY` on the server only.

If you do not want the CLI, import components from `@react-email/components`.
Import `render` and `toPlainText` from `@react-email/render`.
The code below is identical. It is only sourced from those two packages.

## Render a template and send it

```tsx
import { render } from "react-email";
import { createClient } from "samva";
import VerifyEmail from "./emails/verify-email";

const samva = createClient({ apiKey: process.env.SAMVA_API_KEY! });

const html = await render(<VerifyEmail url="https://app.example.com/verify?token=abc123" />);

await samva.messages.send({
  to: [{ email: "ada@example.com" }],
  channel: "email",
  email: { subject: "Verify your email", html },
});
```

`render` is async. Always `await` it.
Samva sends from the verified sender on your account.
The `from` field is optional and defaults to that sender.

## Add a plain-text part

Every email should carry a text alternative.
`toPlainText` derives one from the rendered HTML.

```tsx
import { render, toPlainText } from "react-email";

const html = await render(<VerifyEmail url={url} />);
const text = toPlainText(html);

await samva.messages.send({
  to: [{ email }],
  channel: "email",
  email: { subject: "Verify your email", html, text },
});
```

You can also render text directly with the option
`await render(<VerifyEmail url={url} />, { plainText: true })`.

## A styled template with Tailwind

Wrap the email in `<Tailwind>` and style with utility classes.
React Email inlines them into email-safe CSS at render time.

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

export interface VerifyEmailProps {
  url: string;
  name?: string;
}

export const VerifyEmail = ({ url, name }: VerifyEmailProps) => (
  <Tailwind>
    <Html lang="en">
      <Head />
      <Preview>Confirm your email address</Preview>
      <Body className="bg-gray-100 py-[40px] font-sans">
        <Container className="mx-auto max-w-[465px] rounded-[12px] bg-white px-[40px] py-[32px]">
          <Heading className="m-0 text-[22px] font-bold text-gray-900">Confirm your email</Heading>
          <Text className="mt-[16px] text-[15px] text-gray-700">
            {name ? `Hi ${name},` : "Hi,"} confirm this address to activate your account.
          </Text>
          <Section className="mt-[28px] text-center">
            <Button href={url} className="rounded-[8px] bg-gray-900 px-[28px] py-[14px] text-white">
              Verify email address
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default VerifyEmail;
```

The full template, including link fallback, divider, and footer, lives in the
[`react-email-samva` example](../examples/react-email-samva).

## Preview while you build

With `react-email` installed, the `email` CLI is available locally.

```sh
bunx email dev
bunx email export
```

`email dev` opens a live preview at `http://localhost:3000`.
`email export` writes the rendered `.html` to disk.
`email dev` watches your `emails/` directory and hot-reloads.
Attach sample data so a template renders on its own.

```tsx
VerifyEmail.PreviewProps = {
  url: "https://app.example.com/verify?token=abc123",
  name: "Ada",
} satisfies VerifyEmailProps;
```

See the [React Email docs](https://react.email/docs) for the full component set.

## Render on the edge

`render` needs no Node built-ins.
The Samva SDK is `fetch`-based.
You can render and send end-to-end from a Cloudflare Worker, a Vercel Edge
function, or any edge runtime.

```ts
import { render, toPlainText } from "react-email";
import { createClient } from "samva";
import VerifyEmail from "./emails/verify-email";

export default {
  async fetch(_request: Request, env: { SAMVA_API_KEY: string }) {
    const html = await render(<VerifyEmail url="https://app.example.com/verify" />);
    const samva = createClient({ apiKey: env.SAMVA_API_KEY });
    await samva.messages.send({
      to: [{ email: "ada@example.com" }],
      channel: "email",
      email: { subject: "Verify your email", html, text: toPlainText(html) },
    });
    return new Response("sent");
  },
};
```

To render React Email from a framework route such as a Next.js Route Handler or
Server Action, see the [Next.js cookbook](./nextjs.md).

## FAQ

**Why is `from` optional?** Omit it and Samva sends from the verified domain or sender on your
account. Configure senders at
[samva.dev](https://samva.dev).

**`render` returns a Promise.** It is async in v6. `await` it.
Calling it without `await` yields a `Promise`, not a string.

**HTML vs text.** Send `html` for the rich version.
Send `text` from `toPlainText` as the fallback.
Many clients and spam filters prefer a text part.

**Does the edge runtime need the CLI?** No.
The `email` CLI is a build-time tool.
At runtime you only import `render` and `toPlainText`.
Those run on Workers and Edge directly.

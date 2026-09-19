# React Email + Samva

Render a [React Email](https://react.email) template to HTML and send it with
[Samva](https://samva.dev). This is the **"samva"** entry in the React Email
provider matrix.

## Setup

```sh
bun install
cp .env.example .env   # then add your SAMVA_API_KEY
```

## Preview the template

```sh
bun run dev            # email dev — live preview at http://localhost:3000
```

Edit `emails/verify-email.tsx` and the preview hot-reloads. `bun run export`
writes the rendered HTML to disk for inspection.

## Send it

```sh
bun run send           # render → html + text → samva.messages.send
```

`src/send.tsx` renders the template, derives a plain-text fallback with
`toPlainText`, and sends both via `samva.messages.send`. The `from` field is optional and defaults to the verified sender configured on your account.

## Files

- `emails/verify-email.tsx` — the `<Tailwind>` verification email (typed props).
- `src/send.tsx` — the render-and-send script.

See the [React Email cookbook](../../cookbooks/react-email.md) for the full
walkthrough, including edge rendering.

# SvelteKit Transactional Email

A self-contained SvelteKit app that sends transactional email with
[Samva](https://samva.dev).

It includes both common SvelteKit send paths:

- A contact form backed by a form action in `src/routes/contact/+page.server.ts`.
- A raw `POST /api/send` endpoint in `src/routes/api/send/+server.ts`.

## Setup

```sh
bun install
cp examples/sveltekit-transactional/.env.example examples/sveltekit-transactional/.env
```

Add a real `SAMVA_API_KEY` and a random `SAMVA_SEND_TOKEN` in `.env`. Both are
read only from server code via `$env/dynamic/private`.

Your Samva account must have a verified sender or domain before production sends
will deliver. This example omits the optional `from` field; Samva uses the verified
sender configured on your account.

## Run

```sh
bun run --filter sveltekit-transactional-samva dev
```

Open `http://localhost:5173/contact` and submit the form. Invalid input returns
a SvelteKit `fail(400, ...)` result and re-renders the page with the error.

## Exercise the endpoint

```sh
curl -X POST http://localhost:5173/api/send \
  -H "Authorization: Bearer replace-with-a-random-route-token" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ada@example.com",
    "subject": "Hello from SvelteKit",
    "message": "This was sent through Samva."
  }'
```

The route returns `{ "ok": true }` only after Samva accepts the send. Invalid
payloads return `400`, and missing or invalid bearer tokens return `401`. The
example never stubs a successful send.

## Build

```sh
bun run --filter sveltekit-transactional-samva typecheck
bun run --filter sveltekit-transactional-samva build
```

The default adapter is `@sveltejs/adapter-node` so the example is buildable and
runnable from a local clone. To deploy to Cloudflare Workers, switch
`svelte.config.js` to `@sveltejs/adapter-cloudflare`; the Samva send calls do not
change.

## Files

- `src/lib/server/samva.ts` creates the server-only Samva client at request time.
- `src/lib/contact-email.ts` builds escaped HTML and text email content.
- `src/routes/contact/+page.server.ts` defines the form action send flow.
- `src/routes/contact/+page.svelte` renders the progressively enhanced form.
- `src/routes/api/send/+server.ts` exposes the raw HTTP send endpoint.

See the [SvelteKit cookbook](../../cookbooks/sveltekit.md) for the full
walkthrough, including React Email, Auth.js magic links, and Cloudflare Workers
notes.

# Next.js transactional email with Samva

This example sends transactional email from a Next.js App Router app with the
Samva SDK.

It includes:

- a Server Action contact form at `app/contact`;
- a JSON Route Handler at `app/api/send`;
- a `server-only` Samva client module in `lib/samva.ts`;
- no database, no webhook receiver, and an optional `from` left unset.

## Setup

```sh
bun install
cp examples/nextjs-transactional/.env.example examples/nextjs-transactional/.env
```

Add a real `SAMVA_API_KEY` from an account with a verified sender configured.
Samva uses your account sender, so the SDK payload does not include `from`.

## Run the app

```sh
bun run --filter nextjs-transactional-samva dev
```

Open `http://localhost:3000/contact`, fill out the form, and submit it. The
Server Action calls `samva.messages.send` with the server-only API key.

## Exercise the Route Handler

```sh
curl -X POST http://localhost:3000/api/send \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","message":"Hello from the route handler"}'
```

The handler returns `{ "ok": true, "result": ... }` when Samva accepts the send
and a `400` JSON error for malformed input.

## Validate

```sh
bun run --filter nextjs-transactional-samva typecheck
bun run --filter nextjs-transactional-samva build
```

The build script injects a placeholder key so the server-only module fails
loudly in development but still compiles in CI.

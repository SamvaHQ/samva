# Effect SDK example

Send email with the `samva/effect` SDK entrypoint.

## Setup

```sh
bun install
cp examples/effect-sdk/.env.example examples/effect-sdk/.env
```

Set `SAMVA_API_KEY` in `.env`. The key must belong to a Samva account with a
verified sender. The `from` field is optional; when omitted, Samva sends from
the verified sender.

This example pins `effect@4.0.0-rc.112`, matching the current `samva/effect`
peer dependency. `Client.layerFetch` uses the platform fetch client.

## Send from a script

```sh
bun run send --to ada@example.com --subject "Welcome" --message "Your workspace is ready."
```

`src/send.ts` calls `Email.send`, provides `Client.layerFetch`, and runs the
program with `Effect.runPromise`. Missing `SAMVA_API_KEY` throws before any send
is attempted.

## Run the fetch handler

```sh
bun run serve
```

Then call it:

```sh
curl -sS http://localhost:3000 \
  -H 'content-type: application/json' \
  -d '{"to":"ada@example.com","subject":"Welcome","message":"Your workspace is ready."}'
```

`src/server.ts` builds `Client.layerFetch(config)` once, parses the JSON
body, escapes the plain-text `message` before placing it into HTML, and maps
Samva's semantic tagged errors to HTTP responses:

- `ValidationError` -> `400 validation_failed`, forwarding `error.fields`
- `RateLimitedError` -> `429 rate_limited`, forwarding `error.retryAfterSeconds`
- `UnauthorizedError` and `ForbiddenError` with `catchAuthError` -> `500 samva_configuration_error`

Anything left over is split by `isRetryable`: a retryable failure that outlived
the SDK's backoff answers `502 samva_unavailable`, everything else `500`.

The handler does not wrap the send in `Effect.retry`. Sends carry an
`Idempotency-Key` and retry themselves on throttling and transient failures, so
a failure reaching those handlers has already exhausted the built-in backoff.
Provide `Retry.layer` to tune that policy or `Retry.layerDisabled` to
turn it off.

## Validate the example

```sh
bun run typecheck
bun run build
bun run smoke
```

`bun run smoke` checks local HTML escaping and the missing-key failure path. It
does not stub a successful send; `bun run send` and `bun run serve` call the real
Samva API when configured.

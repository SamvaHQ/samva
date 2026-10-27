# Email SDK example

Send one server-side email through Email SDK with `@samva/email-sdk`.
This adapter requires `@opencoredev/email-sdk@^3.0.1`; upgrade consumers on 1.x or 2.x.

The example uses published dependency ranges for Email SDK and Samva, plus the
workspace adapter while developing this repository. Build and typecheck never
send or require credentials.

## Setup

```sh
bun install
cp examples/email-sdk/.env.example examples/email-sdk/.env
```

Replace the placeholder values in `.env`:

- `SAMVA_API_KEY` — a server-side key for the Samva account.
- `SAMVA_FROM` — a configured sender, as a bare or display-form address.
- `SAMVA_TO` — the recipient used for an explicit example send.

## Validate without sending

```sh
bun --filter @samva-examples/email-sdk typecheck
bun --filter @samva-examples/email-sdk build
```

## Send explicitly

This command calls the configured Samva account. It is not part of build,
typecheck, or repository tests.

```sh
bun --filter @samva-examples/email-sdk send
```

Missing environment variables throw before the adapter calls Samva.

See the [Email SDK cookbook](../../cookbooks/email-sdk.md) for the supported
field and failure contract.

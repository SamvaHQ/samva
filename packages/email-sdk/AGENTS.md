# @samva/email-sdk consumer guide

Provider-owned Samva community adapter for
[Email SDK](https://email-sdk.dev). Register it with `samva({ apiKey })` or
through Email SDK's plugin interface with `samvaPlugin({ apiKey })`.

- Pass a preconfigured Samva Promise `client` for dependency injection; an API
  key is required otherwise.
- Inputs are normalized and validated before Samva is called. Unsupported or
  lossy fields (custom `headers`, `tags`, `sendAt`, attachment `path`,
  `contentId`, `disposition`, reply-to display names) are rejected loudly.
- Advertised capabilities: no repeated headers, native idempotency (an
  `idempotencyKey` becomes Samva's `Idempotency-Key` header), no scheduling, and
  expanded personalization.
- Failures become a redacted `EmailAdapterError` with `status`, `requestId`,
  `retryable`, and `delivery` (`not_sent` or `unknown`); provider bodies and
  credentials are never retained.

This package owns the Email SDK seam only. Samva owns delivery, templates,
events, and visibility. Keep the API key on the server; the adapter reads no
environment variables and loads no `.env` files.

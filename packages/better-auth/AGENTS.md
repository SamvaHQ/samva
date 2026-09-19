# @samva/better-auth consumer guide

Wire Better Auth email callbacks to Samva. Use `withSamva(options, samvaOptions)`
to merge Samva senders into a `BetterAuthOptions` object, or `samvaEmail()`
when you want to attach the callback fragments yourself.

- Pass a `client` for dependency injection, or an `apiKey` (and optional
  `baseUrl`) to let the package create the Samva Promise client lazily.
- `withSamva` never overwrites a callback you already set; it fills only missing
  senders and appends the enabled plugin senders.
- Templates may return a string, an `{ subject?, html, text? }` object, or a
  React Email element rendered through the optional `@react-email/render` peer.
- The default organization-invitation template needs `appUrl` or an explicit
  `templates.organizationInvitation`.
- Missing credentials, an empty recipient, or an empty HTML body fail loudly
  before any send.

`@samva/better-auth` owns callback wiring and rendering only. Samva owns
delivery, templates, events, and visibility. Keep the API key on the server.

# AI SDK tools

Tool results are projections for the model: keep the ids and fields an agent acts on, and never pass raw SDK pages through. Keep the reply target bound to the inbound event. Pass the model's text through the mailbox reply API and preserve the send receipt, including approval holds and idempotency conflicts.

Run `bun run typecheck`, `bun run test`, and `bun run build` from this package.

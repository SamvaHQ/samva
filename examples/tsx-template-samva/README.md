# TSX template

Author a Samva email as an ordinary TSX project and preview it in the
`@samva/vite` editor. The shipped SDK for this example is the same pinned
toolchain a customer installs: `@samva/markup@^0.6.0` and
`@samva/vite@^0.6.0`.

## Run the editor

```sh
bun install
bun run dev
```

Open `http://localhost:5173/`, pick a fixture, and edit `emails/welcome.tsx`.
Supported visual edits update the authored TSX; source stays canonical.

## Structure

```text
emails/welcome.tsx   defineEmail({ id, schema, fixtures, render })
theme.css            Tailwind v4 @theme project tokens
vite.config.ts       samvaEditor({ templatesDir: "emails" })
```

`render` receives validated JSON and returns the subject, optional preheader,
body, and optional plain text. Helpers are separate modules and stay out of the
template catalog. `bun run typecheck` is the no-write gate; publication is a
separate, explicit action.

## Publish and send

Install the CLI (`bun add --dev @samva/cli`) so the `samva` executable resolves.
`bunx samva templates check` executes the declared fixtures without writing.
Publishing and sending a template are API actions owned by the CLI and SDK, not
by this preview:

```sh
bunx samva templates check
bunx samva templates publish
```

See the [TSX template authoring cookbook](../../cookbooks/tsx-templates.md) for
the revision-safe publish and template-send flow.

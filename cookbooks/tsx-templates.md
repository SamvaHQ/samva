# TSX email templates

Samva email templates are ordinary TSX projects. You author the source, preview
it locally, and publish an immutable publication that sends render. The
`samva-integrations` [`tsx-template-samva`](../examples/tsx-template-samva/)
example is the runnable version of this page.

## Install the authoring toolchain

```sh
bun add @samva/markup @samva/vite vite
bun add --dev @samva/cli
```

The `samva` executable comes from `@samva/cli`; run it through your package
runner so the local install resolves.

Set `jsx: "react-jsx"` and `jsxImportSource: "@samva/markup/email"` in
`tsconfig.json`. A template module default-exports `defineEmail({ id, schema,
fixtures, render })` from `@samva/markup/template`; `render` receives validated
JSON and returns the subject, optional preheader, body, and optional text.

```tsx title="emails/welcome.tsx"
/** @jsxImportSource @samva/markup/email */
import { Email, Section } from "@samva/markup/email/components";
import { jsonSchema } from "@samva/markup/input-schema";
import { defineEmail } from "@samva/markup/template";

export default defineEmail({
  id: "welcome",
  schema: jsonSchema<{ firstName: string }>({
    type: "object",
    properties: { firstName: { type: "string" } },
    required: ["firstName"],
    additionalProperties: false,
  }),
  fixtures: { default: { firstName: "Ada" } },
  render: (input) => ({
    subject: `Welcome, ${input.firstName}`,
    body: (
      <Email>
        <Section>
          <h1>Welcome, {input.firstName}</h1>
        </Section>
      </Email>
    ),
  }),
});
```

Template ids are unique within the project and independent of the file name.
Imported helper modules are ordinary modules and stay out of the catalog.

## Preview in the editor

```ts title="vite.config.ts"
import { samvaEditor } from "@samva/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [samvaEditor({ templatesDir: "emails" })] });
```

Run `vite` and open `http://localhost:5173/`. Choose a fixture to render
concrete input; supported visual edits update the authored TSX.

## Check, commit, and publish

```sh
bunx samva templates check
```

`check` runs the no-write TypeScript gate and executes the declared fixtures.
Commit the project with a supported lockfile (Bun text lockfile v2 or npm
lockfile v3); hosted builds consume that locked graph and verify package
integrity. Push the checked source, then publish an exact commit:

```sh
bunx samva templates publish --commit HEAD
```

Publishing pins the project, commit, and entry path and returns an immutable
receipt. Generated HTML and delivery artifacts are not source files.

## Send a published template

A template send renders the template's current publication unless you name one.
Inline content and a template are exclusive: pass `templateId`/`templateSlug`
with `templateData` and omit inline `subject`/`html`/`text`.

```ts
await samva.email.send({
  to: "ada@example.com",
  templateId: "tmpl_7q2xk9mvt4znw8rh",
  inputContractId: "tcon_7q2xk9mvt4znw8rh",
  templateData: { firstName: "Ada" },
});
```

- `publicationId` pins one exact publication forever.
- `inputContractId` follows new publications while the input shape stays put.
- Naming both `publicationId` and `inputContractId` is rejected.

See the runnable [`tsx-template-samva`](../examples/tsx-template-samva/)
example for the full project, and the
[email templates docs](https://samva.dev/docs) for the template API surface.

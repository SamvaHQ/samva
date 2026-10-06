# TSX email templates

Samva email templates are ordinary TSX projects. You author the source, check and preview it
locally, push it to Git, and publish an immutable publication that sends render. The
[`tsx-template-samva`](../examples/tsx-template-samva/) example in this repository is the
runnable version of this page.

## Install the authoring toolchain

```sh
bun add @samva/markup
bun add --dev @samva/cli @samva/vite vite typescript
```

The `samva` executable comes from `@samva/cli`; run it through your package runner so the local
install resolves. The CLI loads the compiler and editor your project installs, so the project's
lockfile pins the version that previews, checks, and builds use. Commit that lockfile (Bun text
lockfile v2 or npm lockfile v3); hosted builds consume the locked graph and verify package
integrity.

To start from the canonical project instead, run `samva templates init --name "Welcome email"
--dir welcome-email`. It creates a Samva-managed project and clones its Git repository.

Set `jsx: "react-jsx"` and `jsxImportSource: "@samva/markup/email"` in `tsconfig.json`.

## Write a template

A template is one `.tsx` file in `templates/` that default-exports `defineTemplate` from
`@samva/markup`: a project-unique kebab-case `id`, a JSON Schema input contract, named fixtures,
and an `email` channel of functions of the input.

```tsx title="templates/welcome.tsx"
/** @jsxImportSource @samva/markup/email */
import { defineTemplate } from "@samva/markup";
import { Email, Section } from "@samva/markup/email";
import { jsonSchema } from "@samva/markup/input-schema";

export default defineTemplate({
  id: "welcome",
  schema: jsonSchema<{ firstName: string; workspace: string }>({
    type: "object",
    properties: {
      firstName: { type: "string" },
      workspace: { type: "string" },
    },
    required: ["firstName", "workspace"],
    additionalProperties: false,
  }),
  fixtures: {
    default: { firstName: "Ada", workspace: "Acme" },
  },
  email: {
    subject: (input) => `Welcome to ${input.workspace}`,
    preheader: (input) => `Welcome aboard, ${input.firstName}`,
    body: (input) => (
      <Email>
        <Section>
          <h1>Welcome, {input.firstName}</h1>
        </Section>
      </Email>
    ),
  },
});
```

`subject` and `preheader` belong to the `email` channel, not to `<Email>`. Plain text is derived
from the body. Every fixture is checked against the schema, and actual send input is validated
against the immutable publication schema.

## Stay inside the static profile

The compiler reads the file and never runs it, so nothing computes at send time. A body can:

- bind input values (`{input.name}`, `href={input.url}`) and build template strings;
- branch with `&&` and `?:`, using `===`, `!==`, `<`, `>`, `!`, `||` and `.length`;
- map over input lists with `.map`, and filter first with `.filter(...)`;
- format with `fmt.money`, `fmt.number`, `fmt.date`, `fmt.time`, `fmt.plural` and `fmt.list`,
  imported from `@samva/markup/fmt`;
- do arithmetic on bound numbers inside a formatter argument or a condition
  (`fmt.money(item.price * item.quantity, input.currency)`);
- call partials: functions from props to JSX in other project files.

```tsx title="templates/receipt.tsx (body)"
<Email>
  {input.items.length > 0 ? (
    input.items.map((item) => <p>{item.name}</p>)
  ) : (
    <p>Nothing in this order.</p>
  )}
  <p>Total {fmt.money(input.total, input.currency)}</p>
  {input.receiptUrl && <Button href={input.receiptUrl}>View receipt</Button>}
</Email>
```

Any other call, statement, hook, or import is a diagnostic with a stable code, a
`file:line:column` location, and a fix. Only `@samva/markup` and files in the project can be
imported. Compute the value in the caller and send it in the input. Read an optional field only
inside a guard. Locale and time zone are send options, not schema fields.

Style with Tailwind classes. `theme.css` holds the project tokens and layers by `@import`; an
organization brand arrives with `@import "samva:brand";`.

## Check, render, preview

```sh
bunx samva templates check
bunx samva templates render receipt --fixture default
bunx samva templates snapshot receipt --fixture default
bunx samva templates dev
```

`check` type-checks, compiles every template, and renders every fixture, with `--watch` for a
continuous gate. `render` prints a fixture's subject, preheader and plain text (`--format html` for
the markup). `snapshot` writes desktop and mobile PNGs, light and dark, to `.samva/snapshots`, and
needs `playwright` or a system Chrome. `dev` starts the local visual editor with no
`vite.config.ts`; keep `.samva` gitignored. `@samva/vite` stays in the project because the CLI
loads it, and its `samvaEditor()` plugin is for custom Vite setups.

Preview is a structural canvas, not an exact Gmail, Outlook, Apple Mail, or Yahoo renderer.

## Commit and publish

```sh
git add .
git commit -m "feat: add the receipt email"
git push origin main
bunx samva templates publish --commit HEAD
```

A project holds several emails: `samva templates add templates/receipt.tsx` registers a new entry
under its `defineTemplate` id, and `samva templates publish --all` publishes every active entry at
one commit. Publishing pins the project, commit, and entry path and returns an immutable receipt; it
does not push or rewrite history. A pushed commit also reaches the hosted editor and agents on the
next workspace open.

## Send a published template

A template send renders the template's current publication unless you name one. Inline content and
a template are exclusive: pass `templateId` or `templateSlug` with `templateData` and omit inline
`subject`/`html`/`text`.

```ts
await samva.email.send({
  to: "ada@example.com",
  templateSlug: "welcome",
  templateData: { firstName: "Ada", workspace: "Acme" },
  locale: "en-US",
  timeZone: "America/New_York",
});
```

- `publicationId` pins one exact publication forever.
- `inputContractId` follows new publications while the input shape stays put.
- Naming both `publicationId` and `inputContractId` is rejected, and each requires `templateId`.
- `locale` and `timeZone` format `fmt.*` output for the recipient.

Generate the input types for your application from the template catalog:

```sh
bunx samva templates types --out src/samva-templates.ts
```

`--check` exits `1` when the file no longer describes the catalog.

See the runnable [`tsx-template-samva`](../examples/tsx-template-samva/) example for the full
project, and the [email templates docs](https://samva.dev/docs) for the template API surface.

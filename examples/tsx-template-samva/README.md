# TSX templates

Author Samva emails as an ordinary TSX project: two `defineTemplate` entries, a project theme, and
the Samva CLI loop for checking, rendering, previewing, and publishing them. The project pins
`@samva/markup@^0.9.0`, `@samva/vite@^0.9.0`, and `@samva/cli@^0.5.0`, the toolchain a customer
installs.

```sh
bun install
bun run dev
```

`bun run dev` runs `samva templates dev`, the local visual editor. It needs no `vite.config.ts`.
Open the URL it prints, choose a fixture, and edit `templates/welcome.tsx`; supported visual edits
update the authored TSX.

## Structure

```text
templates/welcome.tsx             the starter's one-email entry
templates/receipt.tsx             .map, &&, ?: and fmt.money in the static profile
templates/components/line-item.tsx  a partial: props to JSX, inlined by the compiler
starter.css                       the project's look as Tailwind v4 theme variables
theme.css                         imports starter.css; its own @theme overrides win
```

A template default-exports `defineTemplate({ id, schema, fixtures, email })`. The `email` channel
holds `subject`, an optional `preheader`, and the `body`. The compiler reads the file and never runs
it, so a body binds input values, uses `&&` and `?:`, maps over input lists, and calls `fmt.*`;
compute anything else in the caller and send it in the input. Only `@samva/markup` and files in
this project can be imported.

## Check, render, look

```sh
bunx samva templates check
bunx samva templates render receipt --fixture default
bunx samva templates render welcome --fixture team --format html
bunx samva templates snapshot welcome --fixture default
```

`check` type-checks, compiles every template, and renders every fixture; it exits `1` with located
findings when a template leaves the static profile or a fixture breaks the schema. `render` prints a
fixture's subject, preheader, and plain-text body. `snapshot` writes desktop and mobile PNGs, light
and dark, to `.samva/snapshots`, and needs `playwright` in the project or a system Chrome.
`bun run typecheck` is the TypeScript-only gate, and `bun run build` writes the compiled artifact to
`dist/templates.json`.

## Publish and send

Connect the project to a Samva-managed Git repository with `samva templates init`, then push and
publish the exact commit:

```sh
git push origin main
bunx samva templates publish --commit HEAD
```

Generate typed inputs for the application that sends them:

```sh
bunx samva templates types --out src/samva-templates.ts
```

See the [TSX template authoring cookbook](../../cookbooks/tsx-templates.md) for the full loop and
the template-send call.

# Template authoring

Email source is a TSX project. Default-export `defineEmail({ id, schema, fixtures, render })`
from `@samva/markup/template`, use the `@samva/markup/email` JSX runtime and import email
primitives from `@samva/markup/email/components`. The stable id is unique within the project;
imported helper modules are excluded from the catalog. HTML and text are derived output.

Fetch `samva://reference/sml-agent-contract` for the compact executable email contract and
`samva://reference/sml` for the full reference. These resource URIs are stable.

## Authoring contract

The schema is a Standard JSON Schema v1 converter, such as Effect's
`Schema.toStandardJSONSchemaV1` or Zod 4. It produces portable JSON Schema 2020-12.
Render receives unchanged validated JSON and returns subject, optional preheader, body and
optional text. Use ordinary synchronous TypeScript conditions, arrays, nested inputs and helpers.
Strings are escaped content. Use supported HTML for content and email primitives for layout.
General flex and grid layouts are not converted to email tables.

Declare named fixtures for relevant input branches, empty values and repeated content.
Imported CSS follows the cascade; Tailwind uses its compiler and discoverable source classes.
Imported assets become content-addressed assets. Delivery requires their actual HTTPS serving
base; local export may use relative URLs. External HTTPS images remain references.

## Revision-safe workspace loop

1. Discover or create the project, then call `templates_open_workspace` and inspect files, base
   commit, revision and conflicts.
2. Use `templates_diff_workspace` to inspect current changes. Apply complete file replacements
   or deletions with `templates_patch_workspace` and `expectedRevision`.
3. Re-read after mutation. If the revision is stale, rebuild the patch against current source.
4. Reconcile an advanced remote with `templates_reconcile_workspace`; inspect base, draft and
   main before resolving conflicts with `templates_resolve_workspace_conflict`.
5. Run `templates_check_workspace`, inspect schema/fixture and compatibility findings, then
   call `templates_render_fixture` with a reported fixture name.
6. Save when authorized using `templates_save_workspace`. Save validates the project and
   appends a normal Git commit. History and restore preserve that append-only model.
7. Publish when authorized with `templates_publish` from a clean exact commit. Use the resulting
   immutable publication reference for delivery.

Visual edits preserve source expressions. Editing a repeated definition affects its instances;
changing one row's fixture data is a different operation. Inactive conditional branches have no
rendered node. Complex edits can use reviewable source changes instead of literalizing bindings.

## Local checks and visual evidence

Use `samva templates check` for no-write diagnostics, and `samva templates build` for the version 2
JSON artifact containing actual fixture results. Keep dependencies and the supported Bun text v2
or npm v3 lockfile committed for hosted builds. Local preview/build/export require no credentials.

Inspect HTML and text for representative fixtures, responsive layouts and light/dark styles.
A successful fixture check does not cover all possible input; browser preview is not exact inbox
emulation. Send real tests only when authorized, and distinguish client evidence from static
compatibility findings. Raw email sending and structured SMS/WhatsApp remain separate paths.

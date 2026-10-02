# Template authoring

A template is one TSX file in a static profile: ordinary JSX, HTML, and Tailwind that Samva reads
without running. It default-exports `defineTemplate` from `@samva/markup`. Compiling it produces a
JSON IR that the editor, agents, previews, and every send render, so nothing executes at send time.
A body that would compute over its input is a diagnostic: compute the value in the caller and send
it in the payload.

Fetch `samva://reference/contract` for the machine-readable contract (components and props,
static-profile forms, formatters, diagnostic codes) and `samva://reference/sml` for the full
reference. These resource URIs are stable.

## Write a template

```tsx
import { defineTemplate } from "@samva/markup";
import { Button, Email, Section } from "@samva/markup/email/components";
import { fmt } from "@samva/markup/fmt";
import { jsonSchema } from "@samva/markup/input-schema";

export default defineTemplate({
  id: "order-shipped",
  schema: jsonSchema<{ name: string; total: number; currency: string; trackingUrl?: string }>({
    type: "object",
    properties: {
      name: { type: "string" },
      total: { type: "number" },
      currency: { type: "string" },
      trackingUrl: { type: "string" },
    },
    required: ["name", "total", "currency"],
    additionalProperties: false,
  }),
  fixtures: {
    default: { name: "Ada", total: 84, currency: "USD", trackingUrl: "https://track.example/1" },
    "no-tracking": { name: "Ada", total: 84, currency: "USD" },
  },
  email: {
    subject: (input) => `Hi ${input.name}, your order shipped`,
    body: (input) => (
      <Email>
        <Section className="px-8 py-6">
          <p>Total {fmt.money(input.total, input.currency)}</p>
          {input.trackingUrl && (
            <Button href={input.trackingUrl} width={200} height={44}>
              Track package
            </Button>
          )}
        </Section>
      </Email>
    ),
  },
});
```

- `id` is lowercase kebab-case and unique in the project. `subject` and `preheader` belong to the
  `email` channel, never to `<Email>`.
- The schema is a literal `jsonSchema<Input>({ ... })`. It validates every send and drives the
  binding checker. Defaults are not inserted and values are not coerced.
- At least one fixture is required. Add one per branch: default, each optional field missing, and
  many list items.
- Set `jsxImportSource: "@samva/markup/email"` in `tsconfig.json`. Only `@samva/markup` and files in
  the project can be imported.

## Stay inside the static profile

Accepted: bindings (`{input.name}`, `href={input.url}`), template strings, `&&` and `?:`
conditions (`===`, `!==`, `<`, `>`, `<=`, `>=`, `!`, `||`, `.length`), `.map` over input lists,
`.filter(...)` before `.map` or `.length`, `<Columns each={list} per={n}>` grids, `fmt.*`
formatters, partials (functions from props to JSX in project files), literal conditional classes,
and arithmetic inside formatter arguments and conditions.

Rejected with a diagnostic: any call other than `fmt.*` and `.map`, statements in a body, other
imports, hooks, event handlers, `dangerouslySetInnerHTML`, class names built at run time, and a
partial that renders itself. Read an optional field only inside a guard. Locale and time zone are
send options (`locale`, `timeZone`), not schema fields, and `fmt` reads them implicitly.

Use ordinary HTML for content, email components for layout, Tailwind classes for style, and
`theme.css` for tokens. Brand theme, logo, and footer come from `samva:brand`.

## Check, render, look, repair

The loop is the same on every surface:

| Step             | CLI                                | MCP                          |
| ---------------- | ---------------------------------- | ---------------------------- |
| Read the project | files on disk                      | `templates_open_workspace`   |
| Edit             | your editor                        | `templates_patch_workspace`  |
| Check            | `samva templates check`            | `templates_check_workspace`  |
| Render a fixture | `samva templates render --fixture` | `templates_render_fixture`   |
| Look at it       | `samva templates snapshot`         | `templates_snapshot_fixture` |
| Save             | `git commit`, `git push`           | `templates_save_workspace`   |
| Publish          | `samva templates publish`          | `templates_publish`          |

For a cloned project, commit and `git push`; the next hosted workspace open pulls that commit,
rebases independent draft edits, and reports conflicts for overlapping edits.

Each diagnostic has a stable code, a `file:line:column` location, a message, and a fix. Errors block
save and publish; warnings ride along. Fix the named location and check again. Common codes:
`unknown-field` (a misspelled binding, with the nearest field), `unguarded-optional`,
`fixture-invalid`, `dynamic-expression`, `dynamic-class`, and `non-project-import`.

## Revision-safe workspace loop

1. Discover or create the project, then call `templates_open_workspace` and inspect files, base
   commit, revision, and conflicts.
2. Use `templates_diff_workspace` to inspect current changes. Apply complete file replacements or
   deletions with `templates_patch_workspace` and `expectedRevision`.
3. Re-read after mutation. If the revision is stale, rebuild the patch against current source.
4. Reopen with `templates_open_workspace` to pull outside commits; inspect base, draft, and main
   before resolving conflicts with `templates_resolve_workspace_conflict`.
5. Run `templates_check_workspace`, inspect schema, fixture, and compatibility findings, then call
   `templates_render_fixture` and `templates_snapshot_fixture` with a reported fixture name.
6. Save when authorized using `templates_save_workspace`. Save validates the project and appends a
   normal Git commit. History and restore preserve that append-only model.
7. Publish when authorized with `templates_publish` from a clean exact commit. Use the resulting
   immutable publication reference for delivery.

A project holds several templates. A new `templates/*.tsx` file (`emails/` is also recognized) is
not a template until `templates_add_entry` registers it; use its `defineTemplate` id as the slug.
Every template in a project shares one workspace and publishes separately. After renaming a file,
call `templates_move_entry` so the template keeps its id and publications.

## Sending

Send a template by `templateSlug` or `templateId` with `templateData`. Add `locale` (BCP 47, for
example `de-DE`) and `timeZone` (IANA, for example `Europe/Berlin`) to format dates and money for
the recipient; they default to the template's locale and UTC. A publication pins the IR and the
brand version it was built with, so republish to pick up a brand edit. `samva templates types`
generates the input type for your application.

A successful fixture check does not cover all possible input, and a browser preview is not exact
inbox emulation. Send real tests only when authorized, and distinguish client evidence from static
compatibility findings.

# Template authoring

A template is one TSX file in a static profile: ordinary JSX, HTML, and Tailwind that Samva reads
without running. It default-exports `defineTemplate` from `@samva/markup`. Compiling it produces a
JSON compiled template that the editor, agents, previews, and every send render, so nothing executes at send time.
A body that would compute over its input is a diagnostic: compute the value in the caller and send
it in the payload.

Fetch `samva://reference/contract` for the machine-readable contract (components and props,
static-profile forms, formatters, diagnostic codes) and `samva://reference/sml` for the full
reference. These resource URIs are stable.

## Write a template

```tsx
import { defineTemplate } from "@samva/markup";
import { Button, Email, Section } from "@samva/markup/email";
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
  `email` channel, never to `<Email>`. The preheader is also the first line of the plain-text part,
  so write one that adds to the opening line: "Hi Ada" above a body that starts "Hi Ada" reads
  twice in the text.
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

A save, open, publish, or restore whose source cannot build fails with `TemplateSourceError` (HTTP
`422`) and its `diagnostics`; check reports compiler findings in a successful response. Fix the source
as the diagnostics describe, then retry; a `sml/build-failed` finding has no location. A real conflict,
such as a moved branch head, is a `ConflictError` (`409`): reopen and resolve it.

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
call `templates_move_entry` (CLI `samva templates move <from> <to>`; REST `PATCH /v1/templates/{id}`
with `{ "data": { "entryPath": "..." } }`) so the template keeps its id and publications.

A new project's canonical starter registers its one template at `templates/welcome.tsx`, whatever
the slug (the template's `entryPath` reports it). Edit that file in place. If you write the template
to another path instead, move the entry to it: publishing fails while the registered entry path
does not exist at the commit.

## From code without Git

Create, save, and publish over the SDK or REST. Each step uses the previous result:

1. `templates.create({ name, slug })` returns `id` (`tmpl_...`), `slug`, `projectId`, and `entryPath`.
   The project starts from the canonical starter: one entry, `templates/welcome.tsx`, with its
   `defineTemplate` `id` set to the slug (keep it).
2. `templates.openWorkspace({ id })` returns `workspace` (`revision`, starting at `"0"`, and
   `remoteHead`, a 40-hex commit) and `files`.
3. `templates.patchWorkspace({ id, expectedRevision, patches: [{ path, content }] })` replaces or
   deletes (`content: null`) whole files and returns the new view; each patch raises `revision`.
4. `templates.checkWorkspace({ id, expectedRevision })` returns `declaration`, `diagnostics`, and
   `incompatibilities` and writes nothing. REST without `expectedRevision` returns `422`.
5. `templates.saveWorkspace({ id, expectedRevision, expectedHead, message })` returns the saved
   `commit` and the new `revision`.
6. `templates.publish({ id, projectId, entryPath, commitSha, expectedWorkspaceRevision })` takes the
   save receipt's `commit` and `revision`; `templates.renderPublication({ id, publicationId, data })`
   previews the result.

REST calls use `POST /v1/templates`, `POST|PATCH /v1/templates/{id}/workspace`,
`POST .../workspace/check`, `POST .../workspace/save`, `POST .../publications`, and
`POST .../publications/{publicationId}/render`, with the `X-API-Key` header; create, patch, and save
also take an `Idempotency-Key` header. The CLI path is `samva templates workspace` plus
`samva templates init`; `init` does not install dependencies, so run `npm install` or `bun install`
before `check`, and `git push` needs the CLI that configured the project to be signed in for its credential helper.

## Sending

Send a template by `templateSlug` or `templateId` with `templateData`. Pass `from` as an object,
`{ email, name? }`, on a verified domain (a hosted mailbox domain counts); omit it only when the
template sets `fromDefault`, the organization has a default sender, or it has exactly one verified
sender, otherwise the send fails with `FromAddressRequiredError` (`422`) with `verifiedDomains` and `addresses`. `templateSlug` takes the
slug (the `defineTemplate` `id` unless `samva templates add --slug` chose another) and `templateId`
the `tmpl_...` id; name exactly one. The SDK and CLI flatten these fields; `POST /v1/messages` nests
them under `email`, beside `channel` and `to`. Add `locale` (BCP 47, for
example `de-DE`) and `timeZone` (IANA, for example `Europe/Berlin`) to format dates and money for
the recipient; they default to the template's locale and UTC. A publication pins the compiled template and the
brand version it was built with, so republish to pick up a brand edit. `samva templates types`
generates the input type for your application.

A successful fixture check does not cover all possible input, and a browser preview is not exact
inbox emulation. Send real tests only when authorized, and distinguish client evidence from static
compatibility findings.

For email and WhatsApp, pass `channel` to `templates_suggest` and `templates_create_from_brief`.
Read `templates_event_inputs` for the event schema, binding paths and preview samples before
authoring an event-triggered template. Link variants with `templates_families_create` and
`templates_families_attach`. Family members publish independently; WhatsApp members each need
registration and approval. `brands_create` creates a named brand; `brands_set_default` selects
the organization default.

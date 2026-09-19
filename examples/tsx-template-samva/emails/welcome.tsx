/** @jsxImportSource @samva/markup/email */
import { Button, Email, Section } from "@samva/markup/email/components";
import { jsonSchema } from "@samva/markup/input-schema";
import { defineEmail } from "@samva/markup/template";

/**
 * One ordinary TSX email entry. The stable id is project-unique; the schema is
 * the input contract, fixtures drive previews, and render receives validated
 * JSON and returns the subject, optional preheader, body, and optional text.
 */
export default defineEmail({
  id: "welcome",
  schema: jsonSchema<{
    firstName: string;
    workspace: string;
    ctaUrl: string;
  }>({
    type: "object",
    properties: {
      firstName: { type: "string" },
      workspace: { type: "string" },
      ctaUrl: { type: "string" },
    },
    required: ["firstName", "workspace", "ctaUrl"],
    additionalProperties: false,
  }),
  fixtures: {
    default: {
      firstName: "Maya",
      workspace: "Acme",
      ctaUrl: "https://app.example.com",
    },
    team: {
      firstName: "Sam",
      workspace: "Design team",
      ctaUrl: "https://app.example.com/team",
    },
  },
  render: (input) => ({
    subject: `Welcome to ${input.workspace}`,
    preheader: `Welcome aboard, ${input.firstName}`,
    body: (
      <Email lang="en" className="font-body bg-gray-100 dark:bg-gray-900">
        <Section
          width={600}
          tableStyle={{ width: "100%", maxWidth: 600 }}
          className="rounded-lg bg-white px-8 py-6 dark:bg-gray-800"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome, {input.firstName}
          </h1>
          <p className="text-base text-gray-700 dark:text-gray-200">
            Thanks for joining <strong>Samva</strong>. Your workspace {input.workspace} is ready —
            open the <a href="https://samva.dev/docs">docs</a> to begin.
          </p>
          <Button
            href={input.ctaUrl}
            width={200}
            height={48}
            backgroundColor="#4f46e5"
            color="#ffffff"
            borderRadius={6}
            className="bg-brand text-brand-foreground dark:bg-brand-dark dark:text-brand-foreground-dark font-semibold"
          >
            Open dashboard
          </Button>
        </Section>
      </Email>
    ),
  }),
});

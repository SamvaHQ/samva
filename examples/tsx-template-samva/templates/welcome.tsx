/** @jsxImportSource @samva/markup/email */
import { defineTemplate } from "@samva/markup";
import { Button, Email, Section } from "@samva/markup/email/components";
import { jsonSchema } from "@samva/markup/input-schema";

/** The canonical one-email starter entry. */
export default defineTemplate({
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
  email: {
    subject: (input) => `Welcome to ${input.workspace}`,
    preheader: (input) => `Welcome aboard, ${input.firstName}`,
    body: (input) => (
      <Email lang="en" className="font-body bg-background dark:bg-background-dark">
        <Section
          width={600}
          tableStyle={{ width: "100%", maxWidth: 600 }}
          className="rounded-card bg-surface dark:bg-surface-dark px-8 py-6"
        >
          <h1 className="font-heading text-foreground dark:text-foreground-dark text-2xl font-bold">
            Welcome, {input.firstName}
          </h1>
          <p className="text-muted dark:text-muted-dark text-base">
            Thanks for joining <strong>Samva</strong>. Your workspace {input.workspace} is ready —
            open the{" "}
            <a href="https://samva.dev/docs" className="text-accent dark:text-accent-dark">
              docs
            </a>{" "}
            to begin.
          </p>
          <Button
            href={input.ctaUrl}
            width={200}
            height={48}
            backgroundColor="var(--color-brand)"
            color="var(--color-brand-foreground)"
            fontFamily="var(--font-body)"
            borderRadius={6}
            style={{ borderRadius: "var(--radius-button)" }}
            className="bg-brand text-brand-foreground dark:bg-brand-dark dark:text-brand-foreground-dark font-semibold"
          >
            Open dashboard
          </Button>
        </Section>
      </Email>
    ),
  },
});

import { defineAgent, type AgentManifest } from "samva/agent";

export interface OnboardingConfiguration {
  readonly integrationId: string;
  readonly endpointIds: readonly string[];
  readonly followUpTemplate: string;
}

export const createOnboardingAgent = (
  configuration: OnboardingConfiguration,
  instructions: string,
  onboardingSkill: string,
) => {
  const manifest = {
    name: "WhatsApp onboarding",
    version: "0.1.0",
    endpointIds: configuration.endpointIds,
    integrations: [
      {
        integrationId: configuration.integrationId,
        subject: "contact",
        tools: {
          kind: "selected",
          names: [
            "samva.profile_get",
            "samva.approval_requests_create",
            "samva.approval_requests_get",
            "samva.brands_list",
            "samva.brands_get",
            "samva.brands_update",
            "samva.templates_create_from_website",
            "samva.templates_create_from_brief",
            "samva.templates_get",
            "samva.email_domains_list",
            "samva.email_domains_get",
            "samva.email_domains_get_status",
            "samva.email_domains_add",
            "samva.email_senders_list",
            "samva.email_senders_add",
          ],
        },
      },
    ],
    eventTriggers: ["contact.connection_completed", "domain.updated", "review.updated"],
    followUpTemplate: configuration.followUpTemplate,
    knowledgeSourceIds: [],
    policy: {
      presets: [],
      rules: [
        { match: { effect: "read" }, decide: "run" },
        { match: { kind: "reply" }, decide: "run" },
        { match: { tool: "samva.templates_create_from_website" }, decide: "run" },
        { match: { tool: "samva.templates_create_from_brief" }, decide: "run" },
        { match: { effect: "write" }, decide: "model" },
        { match: { effect: "final" }, decide: "person" },
        { match: { tool: "samva.approval_requests_create" }, decide: "run" },
        { match: { tool: "samva.brands_update" }, decide: "run" },
        { match: { tool: "samva.email_domains_add" }, atLeast: "person" },
        { match: { tool: "samva.email_senders_add" }, atLeast: "person" },
      ],
    },
    model: "standard",
    reasoning: "auto",
    workingHours: null,
    takeoverTimeoutMinutes: 30,
  } satisfies AgentManifest;

  // Lifecycle triggers resume the conversation; authored event handlers are a separate runtime.
  return defineAgent({ manifest, instructions, skills: { onboarding: onboardingSkill } });
};

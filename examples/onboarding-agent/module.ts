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
            "profile_get",
            "brands_list",
            "brands_get",
            "brands_update",
            "templates_create_from_website",
            "templates_create_from_brief",
            "templates_get",
            "email_domains_list",
            "email_domains_get",
            "email_domains_get_status",
            "email_domains_add",
            "email_senders_list",
            "email_senders_add",
          ],
        },
      },
    ],
    eventTriggers: ["domain.updated", "review.updated"],
    followUpTemplate: configuration.followUpTemplate,
    knowledgeSourceIds: [],
    policy: {
      presets: [],
      rules: [
        { match: { effect: "read" }, decide: "run" },
        { match: { effect: "write" }, decide: "model" },
        { match: { effect: "final" }, decide: "person" },
        { match: { tool: "email_domains_add" }, atLeast: "person" },
        { match: { tool: "email_senders_add" }, atLeast: "person" },
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

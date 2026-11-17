import { strict as assert } from "node:assert";

import { createClient } from "samva";
import type { AgentContext, AgentModuleAuthority } from "samva/agent";
import { defineEval, runAgent, runEval } from "samva/agent/test";

import agent from "../agent";

const unexpected = async (): Promise<never> => {
  throw new Error("Declaration loading must not make a host call");
};
const ctx: AgentContext = {
  capability: {
    callId: "eval-call",
    organizationId: "eval-org",
    agentId: "eval-agent",
    versionId: "eval-version",
    bundleSha256: "0".repeat(64),
    expiresAt: Date.now() + 60_000,
    trigger: { kind: "event", eventId: "eval-domain", eventType: "domain.updated" },
  },
  samva: createClient({ apiKey: "offline-eval", baseUrl: "http://127.0.0.1:1" }),
  connections: { call: unexpected },
  memory: { search: unexpected, remember: unexpected },
  log: () => {
    throw new Error("Unexpected log");
  },
};
const authority: AgentModuleAuthority = {
  samva: unexpected,
  connection: unexpected,
  searchMemory: unexpected,
  remember: unexpected,
  log: unexpected,
};

const evaluation = defineEval({
  name: "Lifecycle conversation declarations retain contact scope and owner approval floors",
  run: async (definition, context) => {
    const grant = definition.manifest.integrations[0];
    assert.equal(grant?.subject, "contact");
    assert.equal(grant?.tools.kind, "selected");
    if (grant?.tools.kind !== "selected") throw new Error("Expected a bounded tool grant");
    for (const required of [
      "templates_create_from_website",
      "brands_update",
      "email_domains_add",
      "email_senders_add",
    ]) {
      assert.ok(grant.tools.names.includes(required), `Missing connected tool ${required}`);
    }
    for (const forbidden of ["email_send", "whatsapp_setup_links_create", "contacts_merge"]) {
      assert.ok(!grant.tools.names.includes(forbidden), `Unexpected connected tool ${forbidden}`);
    }
    assert.equal(definition.manifest.followUpTemplate, "onboarding-follow-up");
    for (const tool of ["email_domains_add", "email_senders_add"]) {
      assert.ok(
        definition.manifest.policy.rules.some(
          (rule) => rule.match.tool === tool && rule.atLeast === "person",
        ),
      );
    }
    assert.deepEqual(definition.manifest.events, []);
    assert.deepEqual(Object.keys(definition.tools), []);
    const local = runAgent(definition, context);
    assert.ok(local.skill("onboarding").trim().length > 0);
    const expectedInstructions = await local.instructions();
    await Promise.all(
      ["domain.updated", "review.updated"].map(async (eventType) => {
        assert.ok(definition.manifest.eventTriggers?.includes(eventType));
        // oxlint-disable-next-line no-underscore-dangle -- Exercise the SDK runtime entry used by the host.
        const instructions = await definition.__samvaAgentRuntime(
          { kind: "instructions" },
          {
            ...context.capability,
            trigger: { kind: "event", eventId: `eval-${eventType}`, eventType },
          },
          authority,
        );
        assert.equal(instructions, expectedInstructions);
      }),
    );
  },
});

await runEval(agent, evaluation, ctx);
console.log("Onboarding declaration eval passed; conversation behavior requires managed E2E.");

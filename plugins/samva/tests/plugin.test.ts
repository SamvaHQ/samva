import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateAgentPlugin } from "../../../scripts/validate-agent-plugin.mts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryRoots: Array<string> = [];

const fixture = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "samva-agent-plugin-"));
  temporaryRoots.push(root);
  await cp(resolve(repositoryRoot, "plugins"), resolve(root, "plugins"), { recursive: true });
  await cp(resolve(repositoryRoot, ".cursor-plugin"), resolve(root, ".cursor-plugin"), {
    recursive: true,
  });
  await cp(resolve(repositoryRoot, "README.md"), resolve(root, "README.md"));
  return root;
};

const editJson = async (
  root: string,
  path: string,
  edit: (value: Record<string, any>) => void,
): Promise<void> => {
  const absolutePath = resolve(root, path);
  const value = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, any>;
  edit(value);
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Samva agent plugin contract", () => {
  it("accepts the canonical distributable bundle", async () => {
    await expect(validateAgentPlugin(repositoryRoot)).resolves.toEqual([]);
  });

  it("rejects a non-canonical endpoint", async () => {
    const root = await fixture();
    await editJson(root, "plugins/samva/mcp.json", (value) => {
      value.mcpServers.samva.url = "https://example.com/mcp";
    });
    expect(await validateAgentPlugin(root)).toContain(
      "Cursor MCP config must use the canonical HTTP endpoint https://mcp.samva.dev",
    );
  });

  it("rejects repository naming in the branded Cursor marketplace identity", async () => {
    const root = await fixture();
    await editJson(root, ".cursor-plugin/marketplace.json", (value) => {
      value.name = "samva-integrations";
    });
    expect(await validateAgentPlugin(root)).toContain("Cursor marketplace name must be samva");
  });

  it("rejects credentials in MCP configuration", async () => {
    const root = await fixture();
    await editJson(root, "plugins/samva/.mcp.json", (value) => {
      value.mcpServers.samva.headers = { Authorization: "Bearer secret" };
    });
    expect(await validateAgentPlugin(root)).toContain(
      "Codex MCP config contains unsupported or credential-bearing keys: headers",
    );
  });

  it("reports malformed primary JSON as a contract diagnostic", async () => {
    const root = await fixture();
    await writeFile(resolve(root, "plugins/samva/.mcp.json"), "{ not-json\n");
    const errors = await validateAgentPlugin(root);
    expect(errors.some((error) => error.startsWith("Cannot read Codex MCP config:"))).toBe(true);
    expect(errors).toContain("Codex MCP config must define exactly one MCP server named samva");
  });

  it("reports a missing primary artifact as a contract diagnostic", async () => {
    const root = await fixture();
    await rm(resolve(root, "plugins/samva/provenance.json"));
    const errors = await validateAgentPlugin(root);
    expect(errors.some((error) => error.startsWith("Cannot read provenance:"))).toBe(true);
    expect(errors).toContain("Provenance skill version must match SKILL.md");
  });

  it("reports an enumerated file that disappears before reading", async () => {
    const root = await fixture();
    await symlink("missing-doc-source.md", resolve(root, "plugins/samva/docs/disappeared.md"));
    const errors = await validateAgentPlugin(root);
    expect(errors.some((error) => error.startsWith("Cannot read docs/disappeared.md:"))).toBe(true);
  });

  it("rejects a missing canonical reference", async () => {
    const root = await fixture();
    await rm(resolve(root, "plugins/samva/skills/samva/references/auth.md"));
    expect(await validateAgentPlugin(root)).toContain("Missing canonical skill reference: auth.md");
  });

  it("rejects a path that escapes the plugin root", async () => {
    const root = await fixture();
    await editJson(root, "plugins/samva/.cursor-plugin/plugin.json", (value) => {
      value.skills = "./../skills";
    });
    expect(await validateAgentPlugin(root)).toContain(
      "Cursor manifest skills escapes the plugin root",
    );
  });

  it("rejects changed skill content with stale provenance", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/skills/samva/references/sdk.md");
    await writeFile(path, `${await readFile(path, "utf8")}\nChanged.\n`);
    expect(await validateAgentPlugin(root)).toContain(
      "Skill bundle digest does not match provenance",
    );
  });

  it("rejects tools that are unavailable in the canonical MCP surface", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/skills/samva/references/mcp.md");
    const reference = await readFile(path, "utf8");
    await writeFile(
      path,
      reference.replace(
        "`messages_list_email_events`",
        "`messages_list_email_events`, `templates_set_font`",
      ),
    );
    expect(await validateAgentPlugin(root)).toContain(
      "MCP inventory includes unavailable templates_set_font",
    );
  });

  it("rejects the removed workspace reconcile tool in the inventory", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/skills/samva/references/mcp.md");
    const reference = await readFile(path, "utf8");
    await writeFile(
      path,
      reference.replace(
        "`messages_list_email_events`",
        "`messages_list_email_events`, `templates_reconcile_workspace`",
      ),
    );
    expect(await validateAgentPlugin(root)).toContain(
      "MCP inventory includes unavailable templates_reconcile_workspace",
    );
  });

  it("allows unavailable tool names in explanatory prose outside the inventory", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/skills/samva/references/mcp.md");
    await writeFile(path, `${await readFile(path, "utf8")}\nmessages_list_inbound_email\n`);
    expect(await validateAgentPlugin(root)).not.toContain(
      "MCP inventory includes unavailable messages_list_inbound_email",
    );
  });

  it("rejects required tools missing from the inventory even when prose mentions them", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/skills/samva/references/mcp.md");
    const reference = await readFile(path, "utf8");
    await writeFile(path, reference.replace("`messages_send_email`, ", ""));
    expect(await validateAgentPlugin(root)).toContain(
      "MCP inventory is missing messages_send_email",
    );
  });

  it("rejects unsupported product claims", async () => {
    const root = await fixture();
    const path = resolve(root, "plugins/samva/docs/unsupported.md");
    await writeFile(path, "This plugin supports SMS.\n");
    const errors = await validateAgentPlugin(root);
    expect(errors).toContain("Unsupported product claim in docs/unsupported.md");
  });

  describe("published ChatGPT plugin distribution", () => {
    const guidePath = "plugins/samva/docs/chatgpt.md";
    const listingUrl =
      "https://chatgpt.com/plugins/plugin_asdk_app_6a8ebcc4c4c48191b5a3a53638f7b972";

    it("states the portable package version apart from the listing version", async () => {
      const manifest = JSON.parse(
        await readFile(resolve(repositoryRoot, "plugins/samva/.codex-plugin/plugin.json"), "utf8"),
      ) as { version: string };
      const guide = await readFile(resolve(repositoryRoot, guidePath), "utf8");
      expect(guide).toContain(`\`${manifest.version}\``);
      expect(guide).toContain("`1.0.0`");
    });

    it("rejects a guide that links another ChatGPT plugin", async () => {
      const root = await fixture();
      const path = resolve(root, guidePath);
      const guide = await readFile(path, "utf8");
      await writeFile(path, guide.replaceAll(listingUrl, "https://chatgpt.com/plugins/other"));
      const errors = await validateAgentPlugin(root);
      expect(errors).toContain(
        "docs/chatgpt.md links a ChatGPT plugin other than the published Samva listing",
      );
      expect(errors).toContain(`docs/chatgpt.md is missing ${listingUrl}`);
    });

    it("rejects a guide that drops current documentation links", async () => {
      const root = await fixture();
      const path = resolve(root, guidePath);
      const guide = await readFile(path, "utf8");
      await writeFile(path, guide.replaceAll("https://samva.dev/docs/developers/mcp", "MCP docs"));
      expect(await validateAgentPlugin(root)).toContain(
        "docs/chatgpt.md is missing https://samva.dev/docs/developers/mcp",
      );
    });

    it("rejects a guide that loses the read-only first check", async () => {
      const root = await fixture();
      const path = resolve(root, guidePath);
      const guide = await readFile(path, "utf8");
      await writeFile(path, guide.replaceAll("email_check_readiness", "readiness"));
      expect(await validateAgentPlugin(root)).toContain(
        "docs/chatgpt.md is missing email_check_readiness",
      );
    });

    it("rejects a missing guide", async () => {
      const root = await fixture();
      await rm(resolve(root, guidePath));
      const errors = await validateAgentPlugin(root);
      expect(errors.filter((error) => error.includes("docs/chatgpt.md"))).toEqual([
        expect.stringMatching(/^Cannot read docs\/chatgpt\.md:/),
      ]);
    });

    it("rejects an emptied guide", async () => {
      const root = await fixture();
      await writeFile(resolve(root, guidePath), "");
      expect(await validateAgentPlugin(root)).toContain(
        "docs/chatgpt.md is missing email_check_readiness",
      );
    });

    it.each([
      ["README.md", "(./plugins/samva/docs/chatgpt.md)", "(./docs/chatgpt.md)"],
      ["plugins/samva/README.md", "(./docs/chatgpt.md)", "(./plugins/samva/docs/chatgpt.md)"],
    ])(
      "rejects %s when its guide link is missing or resolves to the wrong path",
      async (path, link, wrongLink) => {
        const root = await fixture();
        const file = resolve(root, path);
        const text = await readFile(file, "utf8");
        const message = `${path} must link the ChatGPT guide as ${link}`;
        await writeFile(file, text.replaceAll(link, wrongLink));
        expect(await validateAgentPlugin(root)).toContain(message);
        await writeFile(file, text.replaceAll(link, "(./removed.md)"));
        expect(await validateAgentPlugin(root)).toContain(message);
      },
    );
  });
});

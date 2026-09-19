import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const canonicalEndpoint = "https://mcp.samva.dev";
const cursorClientId = "samva-cursor-plugin";
const oauthScopes = ["openid", "profile", "email", "offline_access"] as const;
const expectedReferences = [
  "auth.md",
  "cli.md",
  "executor.md",
  "mcp.md",
  "sdk.md",
  "template-authoring.md",
] as const;

type JsonObject = Record<string, unknown>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseJson = async (
  errors: Array<string>,
  path: string,
  label: string,
): Promise<JsonObject> => {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(value)) {
      errors.push(`${label} must contain a JSON object`);
      return {};
    }
    return value;
  } catch (error) {
    errors.push(`Cannot read ${label}: ${errorMessage(error)}`);
    return {};
  }
};

const readText = async (errors: Array<string>, path: string, label: string): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    errors.push(`Cannot read ${label}: ${errorMessage(error)}`);
    return "";
  }
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const filesBelow = async (root: string): Promise<Array<string>> => {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(root, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return files.flat().sort();
};

const bundleDigest = async (pluginRoot: string): Promise<string> => {
  const skillRoot = resolve(pluginRoot, "skills/samva");
  const files = await filesBelow(skillRoot);
  const inventory = await Promise.all(
    files.map(async (path) => {
      const digest = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
      return `${digest}  ${relative(pluginRoot, path).split(sep).join("/")}\n`;
    }),
  );
  return `sha256:${createHash("sha256").update(inventory.join("")).digest("hex")}`;
};

const referencedPath = async (
  errors: Array<string>,
  pluginRoot: string,
  label: string,
  value: unknown,
): Promise<void> => {
  if (typeof value !== "string" || !value.startsWith("./")) {
    errors.push(`${label} must be a ./-relative path`);
    return;
  }
  const path = resolve(pluginRoot, value);
  const prefix = `${resolve(pluginRoot)}${sep}`;
  if (!path.startsWith(prefix)) {
    errors.push(`${label} escapes the plugin root`);
  } else if (!(await exists(path))) {
    errors.push(`${label} does not exist: ${value}`);
  }
};

const validateMcp = (
  errors: Array<string>,
  label: string,
  config: JsonObject,
  requireCursorAuth = false,
): void => {
  const servers = config.mcpServers;
  if (!isObject(servers) || Object.keys(servers).length !== 1 || !isObject(servers.samva)) {
    errors.push(`${label} must define exactly one MCP server named samva`);
    return;
  }
  const server = servers.samva;
  if (server.type !== "http" || server.url !== canonicalEndpoint) {
    errors.push(`${label} must use the canonical HTTP endpoint ${canonicalEndpoint}`);
  }
  const allowedKeys = requireCursorAuth ? ["type", "url", "auth"] : ["type", "url"];
  const extraKeys = Object.keys(server).filter((key) => !allowedKeys.includes(key));
  if (extraKeys.length > 0) {
    errors.push(
      `${label} contains unsupported or credential-bearing keys: ${extraKeys.join(", ")}`,
    );
  }
  if (requireCursorAuth) {
    const auth = server.auth;
    if (
      !isObject(auth) ||
      auth.CLIENT_ID !== cursorClientId ||
      !Array.isArray(auth.scopes) ||
      auth.scopes.length !== oauthScopes.length ||
      !oauthScopes.every((scope, index) => auth.scopes?.[index] === scope) ||
      Object.keys(auth).some((key) => key !== "CLIENT_ID" && key !== "scopes")
    ) {
      errors.push(`${label} must use Samva's pre-registered public OAuth client`);
    }
  }
};

export const validateAgentPlugin = async (repositoryRoot: string): Promise<Array<string>> => {
  const errors: Array<string> = [];
  const pluginRoot = resolve(repositoryRoot, "plugins/samva");
  const [codexManifest, cursorManifest, marketplace, codexMcp, cursorMcp, provenance] =
    await Promise.all([
      parseJson(errors, resolve(pluginRoot, ".codex-plugin/plugin.json"), "Codex manifest"),
      parseJson(errors, resolve(pluginRoot, ".cursor-plugin/plugin.json"), "Cursor manifest"),
      parseJson(
        errors,
        resolve(repositoryRoot, ".cursor-plugin/marketplace.json"),
        "Cursor marketplace",
      ),
      parseJson(errors, resolve(pluginRoot, ".mcp.json"), "Codex MCP config"),
      parseJson(errors, resolve(pluginRoot, "mcp.json"), "Cursor MCP config"),
      parseJson(errors, resolve(pluginRoot, "provenance.json"), "provenance"),
    ]);

  const manifests = [
    ["Codex manifest", codexManifest],
    ["Cursor manifest", cursorManifest],
  ] as const;
  for (const [label, manifest] of manifests) {
    if (manifest.name !== "samva") errors.push(`${label} name must be samva`);
    if (manifest.version !== "0.3.0") errors.push(`${label} version must be 0.3.0`);
  }
  await Promise.all([
    ...manifests.flatMap(([label, manifest]) => [
      referencedPath(errors, pluginRoot, `${label} skills`, manifest.skills),
      referencedPath(errors, pluginRoot, `${label} MCP config`, manifest.mcpServers),
    ]),
    referencedPath(errors, pluginRoot, "Codex logo", (codexManifest.interface as JsonObject)?.logo),
    referencedPath(
      errors,
      pluginRoot,
      "Codex composer icon",
      (codexManifest.interface as JsonObject)?.composerIcon,
    ),
    referencedPath(errors, pluginRoot, "Cursor logo", cursorManifest.logo),
  ]);

  if (marketplace.name !== "samva") {
    errors.push("Cursor marketplace name must be samva");
  }
  const marketplaceOwner = marketplace.owner;
  if (!isObject(marketplaceOwner) || marketplaceOwner.name !== "Arya Labs, Inc.") {
    errors.push("Cursor marketplace owner must be Arya Labs, Inc.");
  }
  const marketplaceMetadata = marketplace.metadata;
  if (
    !isObject(marketplaceMetadata) ||
    marketplaceMetadata.description !== "Official Samva coding-agent plugins and integrations."
  ) {
    errors.push("Cursor marketplace description must use the canonical Samva description");
  }

  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) {
    errors.push("Cursor marketplace must contain exactly one plugin");
  } else {
    const entry = marketplace.plugins[0];
    if (!isObject(entry) || entry.name !== "samva" || entry.source !== "plugins/samva") {
      errors.push("Cursor marketplace must point samva to plugins/samva");
    }
  }

  validateMcp(errors, "Codex MCP config", codexMcp);
  validateMcp(errors, "Cursor MCP config", cursorMcp, true);

  const skillRoot = resolve(pluginRoot, "skills/samva");
  const skill = await readText(errors, resolve(skillRoot, "SKILL.md"), "SKILL.md");
  const version = skill.match(/metadata:\s*\n\s*version:\s*([^\s]+)/)?.[1];
  const provenanceSkill = provenance.skill;
  if (!isObject(provenanceSkill) || provenanceSkill.version !== version) {
    errors.push("Provenance skill version must match SKILL.md");
  }
  const linkedReferences = [...skill.matchAll(/\(references\/([^)]+\.md)\)/g)].map(
    (match) => match[1],
  );
  await Promise.all(
    expectedReferences.map(async (reference) => {
      if (!linkedReferences.includes(reference)) errors.push(`SKILL.md does not link ${reference}`);
      if (!(await exists(resolve(skillRoot, "references", reference)))) {
        errors.push(`Missing canonical skill reference: ${reference}`);
      }
    }),
  );
  let referenceFiles: Array<string> = [];
  try {
    referenceFiles = await readdir(resolve(skillRoot, "references"));
  } catch (error) {
    errors.push(`Cannot read skill references: ${errorMessage(error)}`);
  }
  const unexpectedReferences = referenceFiles.filter(
    (name) => name.endsWith(".md") && !expectedReferences.includes(name as never),
  );
  if (unexpectedReferences.length > 0) {
    errors.push(`Unexpected skill references: ${unexpectedReferences.join(", ")}`);
  }

  const bundle = isObject(provenanceSkill) ? provenanceSkill.bundle : undefined;
  const archive = isObject(provenanceSkill) ? provenanceSkill.archive : undefined;
  if (!isObject(bundle) || bundle.algorithm !== "sha256-file-list-v1") {
    errors.push("Provenance must declare sha256-file-list-v1 for the local bundle");
  } else {
    try {
      if (bundle.digest !== (await bundleDigest(pluginRoot))) {
        errors.push("Skill bundle digest does not match provenance");
      }
    } catch (error) {
      errors.push(`Cannot calculate skill bundle digest: ${errorMessage(error)}`);
    }
  }
  if (
    !isObject(archive) ||
    archive.url !== "https://samva.dev/.well-known/agent-skills/samva.tar.gz" ||
    typeof archive.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(archive.digest)
  ) {
    errors.push("Provenance must identify the canonical public archive and SHA-256 digest");
  }
  const source = provenance.source;
  if (
    !isObject(source) ||
    source.repository !== "https://github.com/AryaLabsHQ/samva" ||
    typeof source.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    source.path !== "apps/web/content/agent-skills/samva"
  ) {
    errors.push("Provenance must identify the canonical source repository, SHA, and path");
  }

  let distributableFiles: Array<string> = [];
  try {
    distributableFiles = (await filesBelow(pluginRoot)).filter((path) =>
      /\.(?:json|md)$/i.test(path),
    );
  } catch (error) {
    errors.push(`Cannot enumerate plugin files: ${errorMessage(error)}`);
  }
  await Promise.all(
    distributableFiles.map(async (path) => {
      const text = await readText(errors, path, relative(pluginRoot, path));
      if (/samva_sk_(?:live|test)_[A-Za-z0-9]{20,}/.test(text)) {
        errors.push(`Embedded Samva API key in ${relative(pluginRoot, path)}`);
      }
      if (
        /\b(?:supports?|includes?|provides?)\s+(?:sms|whatsapp|code mode|openapi search)/i.test(
          text,
        )
      ) {
        errors.push(`Unsupported product claim in ${relative(pluginRoot, path)}`);
      }
    }),
  );

  const mcpReference = await readText(
    errors,
    resolve(skillRoot, "references/mcp.md"),
    "MCP reference",
  );
  const mcpInventory = mcpReference.match(
    /<!-- email-launch-mcp-tools:start -->([\s\S]*?)<!-- email-launch-mcp-tools:end -->/,
  )?.[1];
  if (mcpInventory === undefined) {
    errors.push("MCP reference is missing the canonical tool inventory block");
  }
  for (const required of [
    "messages_send_email",
    "email_domains_remove",
    "templates_publish",
    "scheduled_messages_cancel",
    "campaigns_control_run",
  ]) {
    if (!mcpInventory?.includes(required)) errors.push(`MCP inventory is missing ${required}`);
  }
  for (const required of ["samva://reference/sml-agent-contract", "idempotentHint: false"]) {
    if (!mcpReference.includes(required)) errors.push(`MCP reference is missing ${required}`);
  }
  for (const unavailable of ["messages_list_inbound_email", "templates_set_font"]) {
    if (mcpInventory?.includes(unavailable)) {
      errors.push(`MCP inventory includes unavailable ${unavailable}`);
    }
  }

  const publicDocRequirements = new Map([
    [
      "docs/codex-and-cursor.md",
      [
        ".codex-plugin/plugin.json",
        ".cursor-plugin/marketplace.json",
        "skills/samva/SKILL.md",
        "https://mcp.samva.dev",
      ],
    ],
    [
      "docs/claude.md",
      [
        "does not package a Claude plugin",
        "Streamable HTTP",
        "Interactive OAuth",
        "API-key clients",
      ],
    ],
    [
      "docs/auth-and-permissions.md",
      [
        "Data boundary",
        "Side-effect boundary",
        "canonical MCP tool inventory",
        "five operating references",
      ],
    ],
    [
      "docs/verification.md",
      ["Automated package conformance", "Synthetic read examples", "Synthetic write examples"],
    ],
  ]);
  await Promise.all(
    [...publicDocRequirements].map(async ([path, requirements]) => {
      const text = await readText(errors, resolve(pluginRoot, path), path);
      for (const requirement of requirements) {
        if (!text.includes(requirement)) errors.push(`${path} is missing ${requirement}`);
      }
    }),
  );

  return errors;
};

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const repositoryRoot = resolve(dirname(scriptPath), "..");
  const errors = await validateAgentPlugin(repositoryRoot);
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Samva agent plugin contract is valid.");
  }
}

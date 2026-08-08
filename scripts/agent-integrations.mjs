import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(repoRoot, "config/agent-integrations.json");
const lifecycleValues = new Set(["active", "optional", "dormant"]);
const agentSurfaceValues = new Set([
  "app",
  "cli",
  "hybrid",
  "mcp",
  "repository-cli",
]);

if (isMainModule()) {
  main();
}

export function loadIntegrationCatalog(path = catalogPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateIntegrationCatalog(catalog, context = {}) {
  const errors = [];
  const ids = new Set();
  const packageScripts = context.packageScripts ?? {};
  const envNames = context.envNames ?? new Set();
  const pathExists = context.pathExists ?? (() => true);

  if (catalog?.version !== 1) {
    errors.push("catalog version must be 1");
  }
  if (!catalog?.policy || typeof catalog.policy !== "object") {
    errors.push("catalog policy is required");
  }
  if (!Array.isArray(catalog?.services) || catalog.services.length === 0) {
    errors.push("catalog services must be a non-empty array");
    return errors;
  }

  for (const [index, service] of catalog.services.entries()) {
    const label = service?.id || `services[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service?.id ?? "")) {
      errors.push(`${label}: id must use lowercase kebab-case`);
    } else if (ids.has(service.id)) {
      errors.push(`${label}: duplicate id`);
    } else {
      ids.add(service.id);
    }

    for (const field of ["name", "purpose", "runtimeSurface", "writePolicy"]) {
      if (typeof service?.[field] !== "string" || !service[field].trim()) {
        errors.push(`${label}: ${field} is required`);
      }
    }

    if (!lifecycleValues.has(service?.lifecycle)) {
      errors.push(`${label}: unsupported lifecycle ${service?.lifecycle}`);
    }
    if (!agentSurfaceValues.has(service?.agent?.primary)) {
      errors.push(`${label}: unsupported agent primary surface`);
    }
    if (
      typeof service?.agent?.guidance !== "string" ||
      !service.agent.guidance.trim()
    ) {
      errors.push(`${label}: agent guidance is required`);
    }

    for (const command of service?.repoCommands ?? []) {
      if (!Object.hasOwn(packageScripts, command)) {
        errors.push(`${label}: unknown package script ${command}`);
      }
    }

    for (const envName of service?.env ?? []) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(envName)) {
        errors.push(`${label}: invalid env name ${envName}`);
      } else if (envNames.size > 0 && !envNames.has(envName)) {
        errors.push(`${label}: ${envName} is missing from .env.example`);
      }
    }

    for (const doc of service?.docs ?? []) {
      if (typeof doc !== "string" || !doc.trim() || !pathExists(doc)) {
        errors.push(`${label}: missing documentation path ${doc}`);
      }
    }

    for (const cli of service?.cli ?? []) {
      if (!/^[A-Za-z0-9._+-]+$/.test(cli?.command ?? "")) {
        errors.push(`${label}: invalid CLI command ${cli?.command}`);
      }
      if (cli?.minimumVersion && !isSemanticVersion(cli.minimumVersion)) {
        errors.push(`${label}: invalid minimumVersion ${cli.minimumVersion}`);
      }
    }

    if (service?.mcp) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.mcp.name ?? "")) {
        errors.push(`${label}: MCP name must use lowercase kebab-case`);
      }
      const parsedUrl = parseUrl(service.mcp.url);
      if (!parsedUrl) {
        errors.push(`${label}: MCP URL must be a valid HTTP(S) URL`);
      } else if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push(`${label}: MCP URL must use HTTP(S)`);
      }
      for (const [key, value] of Object.entries(
        service.mcp.requiredQuery ?? {}
      )) {
        if (parsedUrl?.searchParams.get(key) !== value) {
          errors.push(`${label}: MCP URL must set ${key}=${value}`);
        }
      }
    }
  }

  return errors;
}

export function inspectMcpConfiguration(service, servers) {
  if (!service.mcp) return [];

  const findings = [];
  const expected = service.mcp;
  const named = servers.find((server) => server.name === expected.name);
  const expectedUrl = parseUrl(expected.url);

  if (!named) {
    if (expected.recommended) {
      findings.push({
        status: "warn",
        message: `recommended MCP ${expected.name} is not configured`,
        recovery: expected.setup,
      });
    }
  } else if (!urlsEqual(named.transport?.url, expected.url)) {
    findings.push({
      status: "warn",
      message: `MCP ${expected.name} does not match the catalog URL`,
      recovery: expected.setup,
    });
  } else {
    findings.push({
      status: "pass",
      message: `MCP ${expected.name} matches the catalog`,
    });
  }

  if (expectedUrl && expected.requiredQuery) {
    for (const server of servers) {
      const currentUrl = parseUrl(server.transport?.url);
      if (!sameOriginAndPath(currentUrl, expectedUrl)) continue;

      const missing = Object.entries(expected.requiredQuery)
        .filter(([key, value]) => currentUrl.searchParams.get(key) !== value)
        .map(([key, value]) => `${key}=${value}`);
      if (missing.length > 0) {
        findings.push({
          status: "warn",
          message: `MCP ${server.name} reaches ${expectedUrl.hostname} without required scope: ${missing.join(", ")}`,
          recovery: `Remove or disable the broad ${server.name} connection after ${expected.name} is authenticated.`,
        });
      }
    }
  }

  return findings;
}

export function compareSemanticVersions(actual, minimum) {
  const actualParts = parseSemanticVersion(actual);
  const minimumParts = parseSemanticVersion(minimum);
  if (!actualParts || !minimumParts) return undefined;

  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > minimumParts[index]) return 1;
    if (actualParts[index] < minimumParts[index]) return -1;
  }
  return 0;
}

export function parseEnvExampleNames(text) {
  const names = new Set();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

function main() {
  const [command = "list", id, ...flags] = process.argv.slice(2);
  const catalog = loadIntegrationCatalog();
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8")
  );
  const envNames = parseEnvExampleNames(
    readFileSync(resolve(repoRoot, ".env.example"), "utf8")
  );
  const errors = validateIntegrationCatalog(catalog, {
    packageScripts: packageJson.scripts,
    envNames,
    pathExists: (path) => existsSync(resolve(repoRoot, path)),
  });

  if (errors.length > 0) {
    console.error("Agent integration catalog is invalid:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  if (command === "list") {
    printServiceList(catalog.services);
    return;
  }
  if (command === "show") {
    const service = findService(catalog, id);
    printService(service);
    return;
  }
  if (command === "doctor") {
    const service =
      id && !id.startsWith("--") ? findService(catalog, id) : null;
    const json = flags.includes("--json") || id === "--json";
    runDoctor(catalog, service ? [service] : catalog.services, { json });
    return;
  }

  console.error(
    "Usage: node scripts/agent-integrations.mjs <list|show <service>|doctor [service] [--json]>"
  );
  process.exit(1);
}

function printServiceList(services) {
  const idWidth = Math.max(...services.map((service) => service.id.length), 7);
  const surfaceWidth = Math.max(
    ...services.map((service) => service.agent.primary.length),
    7
  );
  console.log(
    `${"SERVICE".padEnd(idWidth)}  ${"SURFACE".padEnd(surfaceWidth)}  PURPOSE`
  );
  for (const service of services) {
    console.log(
      `${service.id.padEnd(idWidth)}  ${service.agent.primary.padEnd(surfaceWidth)}  ${service.purpose}`
    );
  }
  console.log(
    "\nUse `npm run agent:service -- <service>` for targets, commands, guardrails, and docs."
  );
}

function printService(service) {
  console.log(`${service.name} [${service.lifecycle}]`);
  console.log(`Purpose: ${service.purpose}`);
  console.log(`Agent surface: ${service.agent.primary}`);
  console.log(`Guidance: ${service.agent.guidance}`);
  console.log(`Runtime: ${service.runtimeSurface}`);

  printEntries("Targets", Object.entries(service.targets ?? {}));
  printEntries(
    "Repository commands",
    (service.repoCommands ?? []).map((command) => [
      command,
      `npm run ${command}`,
    ])
  );
  printEntries(
    "CLI",
    (service.cli ?? []).map((cli) => [
      cli.command,
      `${cli.verify}${cli.minimumVersion ? ` (minimum ${cli.minimumVersion})` : ""}`,
    ])
  );
  if (service.mcp) {
    printEntries("MCP", [
      [service.mcp.name, service.mcp.url],
      ["setup", service.mcp.setup],
      ["verify", service.mcp.verify],
    ]);
  }
  printEntries(
    "Environment names",
    (service.env ?? []).map((name) => [name, ""])
  );
  console.log("\nWrite policy:");
  console.log(`  ${service.writePolicy}`);
  printEntries(
    "Docs",
    (service.docs ?? []).map((doc) => [doc, ""])
  );
}

function runDoctor(catalog, services, { json }) {
  const mcpSnapshot = readMcpServers();
  const findings = [
    {
      service: "catalog",
      status: "pass",
      message: `${catalog.services.length} services validated without reading secret values`,
    },
  ];

  if (!mcpSnapshot.available) {
    findings.push({
      service: "mcp",
      status: "warn",
      message:
        "Codex MCP configuration is unavailable; MCP checks were skipped",
    });
  }

  for (const service of services) {
    for (const cli of service.cli ?? []) {
      const executable = findExecutable(cli.command);
      if (!executable) {
        if (cli.recommended) {
          findings.push({
            service: service.id,
            status: "warn",
            message: `${cli.command} CLI is not installed`,
            recovery: cli.install,
          });
        }
        continue;
      }

      const version = readCommandVersion(
        executable,
        cli.versionArgs ?? ["--version"]
      );
      if (cli.minimumVersion) {
        const comparison = compareSemanticVersions(version, cli.minimumVersion);
        if (comparison === undefined || comparison < 0) {
          findings.push({
            service: service.id,
            status: "warn",
            message: `${cli.command} version ${version || "unknown"} is below or cannot prove minimum ${cli.minimumVersion}`,
            recovery: cli.install,
          });
          continue;
        }
      }
      findings.push({
        service: service.id,
        status: "pass",
        message: `${cli.command} CLI is available${version ? ` (${version})` : ""}`,
      });
    }

    if (mcpSnapshot.available) {
      for (const finding of inspectMcpConfiguration(
        service,
        mcpSnapshot.servers
      )) {
        findings.push({ service: service.id, ...finding });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else {
    for (const finding of findings) {
      console.log(
        `${finding.status.toUpperCase().padEnd(5)} ${finding.service}: ${finding.message}`
      );
      if (finding.recovery) console.log(`      Recovery: ${finding.recovery}`);
    }
    const warnings = findings.filter((finding) => finding.status === "warn");
    console.log(
      `\nAgent integration doctor passed with ${warnings.length} warning(s). Warnings are optional workstation setup, not provider authorization.`
    );
  }
}

function readMcpServers() {
  const codex = findExecutable("codex");
  if (!codex) return { available: false, servers: [] };

  const result = spawnSync(codex, ["mcp", "list", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
  if (result.status !== 0) return { available: false, servers: [] };

  try {
    const servers = JSON.parse(result.stdout);
    return { available: Array.isArray(servers), servers: servers ?? [] };
  } catch {
    return { available: false, servers: [] };
  }
}

function findExecutable(command, pathValue = process.env.PATH ?? "") {
  if (!/^[A-Za-z0-9._+-]+$/.test(command)) return undefined;
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

function readCommandVersion(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
}

function findService(catalog, id) {
  const service = catalog.services.find((candidate) => candidate.id === id);
  if (service) return service;
  console.error(`Unknown integration: ${id || "(missing)"}`);
  console.error(
    `Available: ${catalog.services.map((candidate) => candidate.id).join(", ")}`
  );
  process.exit(1);
}

function printEntries(label, entries) {
  if (entries.length === 0) return;
  console.log(`\n${label}:`);
  for (const [key, value] of entries) {
    console.log(`  ${key}${value ? `: ${value}` : ""}`);
  }
}

function parseUrl(value) {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function urlsEqual(left, right) {
  const leftUrl = parseUrl(left);
  const rightUrl = parseUrl(right);
  if (!leftUrl || !rightUrl || !sameOriginAndPath(leftUrl, rightUrl)) {
    return false;
  }
  return normalizedQuery(leftUrl) === normalizedQuery(rightUrl);
}

function sameOriginAndPath(left, right) {
  if (!left || !right) return false;
  return (
    left.origin === right.origin &&
    left.pathname.replace(/\/$/, "") === right.pathname.replace(/\/$/, "")
  );
}

function normalizedQuery(url) {
  return [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function isSemanticVersion(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function parseSemanticVersion(value) {
  const match = String(value ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : undefined;
}

function isMainModule() {
  return (
    Boolean(process.argv[1]) &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

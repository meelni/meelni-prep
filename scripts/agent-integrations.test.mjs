import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  compareSemanticVersions,
  inspectMcpConfiguration,
  loadIntegrationCatalog,
  parseEnvExampleNames,
  validateIntegrationCatalog,
} from "./agent-integrations.mjs";

const catalog = loadIntegrationCatalog();
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const envNames = parseEnvExampleNames(readFileSync(".env.example", "utf8"));

test("agent integration catalog references real commands, env names, and docs", () => {
  assert.deepEqual(
    validateIntegrationCatalog(catalog, {
      packageScripts: packageJson.scripts,
      envNames,
      pathExists: existsSync,
    }),
    []
  );
  assert.ok(catalog.services.length >= 10);
});

test("catalog validation rejects duplicate services and unscoped required MCP queries", () => {
  const fixture = structuredClone(catalog);
  fixture.services.push(structuredClone(fixture.services[0]));
  fixture.services[0].mcp.url = "https://mcp.supabase.com/mcp";

  const errors = validateIntegrationCatalog(fixture, {
    packageScripts: packageJson.scripts,
    envNames,
    pathExists: existsSync,
  });

  assert.ok(errors.some((error) => error.includes("duplicate id")));
  assert.ok(errors.some((error) => error.includes("project_ref=")));
  assert.ok(errors.some((error) => error.includes("read_only=true")));
});

test("MCP inspection detects a broad Supabase connection", () => {
  const service = catalog.services.find(({ id }) => id === "supabase");
  const findings = inspectMcpConfiguration(service, [
    {
      name: "supabase",
      transport: { url: "https://mcp.supabase.com/mcp" },
    },
    {
      name: "supabase-preview",
      transport: {
        url: "https://mcp.supabase.com/mcp?features=docs%2Cdatabase%2Cdebugging%2Cdevelopment&read_only=true&project_ref=kxpvidtxznllfosfemdl",
      },
    },
  ]);

  assert.ok(
    findings.some(
      ({ status, message }) =>
        status === "pass" && message.includes("supabase-preview")
    )
  );
  assert.ok(
    findings.some(
      ({ status, message }) =>
        status === "warn" && message.includes("without required scope")
    )
  );
});

test("semantic version comparison accepts command prefixes and rejects old tools", () => {
  assert.equal(compareSemanticVersions("lk version 2.18.2", "2.18.2"), 0);
  assert.equal(compareSemanticVersions("stripe version 1.32.0", "1.43.3"), -1);
  assert.equal(compareSemanticVersions("2.110.0", "2.109.1"), 1);
  assert.equal(compareSemanticVersions("unknown", "2.109.1"), undefined);
});

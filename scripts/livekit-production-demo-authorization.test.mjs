import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LIVEKIT_PRODUCTION_DEMO_ACTION,
  LIVEKIT_PRODUCTION_DEMO_AGENT_ID,
  LIVEKIT_PRODUCTION_DEMO_URL,
  resolveLiveKitProductionDemoAuthorizationInput,
} from "../lib/operations/livekit-production-demo-authorization.mjs";
import { sha256 } from "../lib/operations/production-action-authorization.mjs";
import { runLiveKitProductionDemoAuthorizationCli } from "./livekit-production-demo-authorization.mjs";

async function fixture() {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-livekit-demo-production-authorization-")
  );
  await chmod(directory, 0o700);
  const configFile = join(directory, "livekit.toml");
  const secretsFile = join(directory, "demo-secrets.env");
  const configuration =
    '[project]\nsubdomain = "meelni-ek4vaisp"\n\n[agent]\nid = "CA_t3sKQEihMQ7x"\n';
  const secrets = [
    "OPIK_TRACING_ENABLED=true",
    `OPIK_API_KEY=${"k".repeat(25)}`,
    "OPIK_WORKSPACE=savi-singh",
    "OPIK_PROJECT_NAME=meelni",
    "OPIK_CAPTURE_CONTENT=true",
    "LIVEKIT_DEMO_AGENT_NAME=CA_t3sKQEihMQ7x",
    "",
  ].join("\n");
  await writeFile(configFile, configuration, { mode: 0o600 });
  await writeFile(secretsFile, secrets, { mode: 0o600 });
  await chmod(secretsFile, 0o600);
  return { configFile, configuration, directory, secrets, secretsFile };
}

test("resolves the exact guarded Production demo fingerprints", async () => {
  const value = await fixture();
  try {
    const result = await resolveLiveKitProductionDemoAuthorizationInput({
      configFile: value.configFile,
      secretsFile: value.secretsFile,
      repoRoot: process.cwd(),
    });
    assert.deepEqual(result, {
      action: LIVEKIT_PRODUCTION_DEMO_ACTION,
      configurationSha256: sha256(Buffer.from(value.configuration)),
      targetFingerprint: sha256(
        [
          "livekit",
          "production",
          "demo",
          LIVEKIT_PRODUCTION_DEMO_URL,
          LIVEKIT_PRODUCTION_DEMO_AGENT_ID,
          "runtime-secrets-sha256",
          sha256(Buffer.from(value.secrets)),
        ].join(":")
      ),
    });
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("prepares and verifies the demo action without exposing secrets", async () => {
  const value = await fixture();
  const stdout = [];
  const prepared = [];
  const verified = [];
  const candidateSha = "d".repeat(40);
  try {
    await runLiveKitProductionDemoAuthorizationCli({
      argv: [
        "prepare",
        "--expected-candidate-sha",
        candidateSha,
        "--config-file",
        value.configFile,
        "--secrets-file",
        value.secretsFile,
        "--output-path",
        join(value.directory, "unsigned.json"),
      ],
      stdout: { write: (text) => stdout.push(text) },
      prepare: async (input) => prepared.push(input),
      resolveCandidate: async () => candidateSha,
    });
    await runLiveKitProductionDemoAuthorizationCli({
      argv: [
        "verify",
        "--expected-candidate-sha",
        candidateSha,
        "--config-file",
        value.configFile,
        "--secrets-file",
        value.secretsFile,
        "--artifact-path",
        join(value.directory, "authorization.json"),
      ],
      stdout: { write: (text) => stdout.push(text) },
      verify: async (input) => verified.push(input),
      resolveCandidate: async () => candidateSha,
    });

    assert.equal(prepared[0].action, LIVEKIT_PRODUCTION_DEMO_ACTION);
    assert.equal(verified[0].action, LIVEKIT_PRODUCTION_DEMO_ACTION);
    assert.deepEqual(stdout, [
      '{"result":"unsigned_payload_written"}\n',
      '{"result":"authorization_valid"}\n',
    ]);
    assert.doesNotMatch(stdout.join(""), /k{25}|[a-f0-9]{64}/);
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

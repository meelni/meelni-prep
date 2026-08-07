import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LIVEKIT_PRODUCTION_INTERVIEW_ACTION,
  LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID,
  LIVEKIT_PRODUCTION_INTERVIEW_URL,
  resolveLiveKitProductionInterviewAuthorizationInput,
} from "../lib/operations/livekit-production-interview-authorization.mjs";
import { sha256 } from "../lib/operations/production-action-authorization.mjs";
import { runLiveKitProductionInterviewAuthorizationCli } from "./livekit-production-interview-authorization.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function fixture() {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-livekit-production-authorization-")
  );
  await chmod(directory, 0o700);
  const configFile = join(directory, "livekit.toml");
  const secretsFile = join(directory, "interview-secrets.env");
  const configuration =
    '[project]\nsubdomain = "meelni-ek4vaisp"\n\n[agent]\nid = "CA_yawKG67rCMG4"\n';
  const secrets = [
    `MEELNI_TRANSCRIPT_INGEST_SECRET=${"a".repeat(32)}`,
    "OPIK_TRACING_ENABLED=true",
    `OPIK_API_KEY=${"k".repeat(25)}`,
    "OPIK_WORKSPACE=savi-singh",
    "OPIK_PROJECT_NAME=meelni",
    "OPIK_CAPTURE_CONTENT=true",
    "",
  ].join("\n");
  await writeFile(configFile, configuration, { mode: 0o600 });
  await writeFile(secretsFile, secrets, { mode: 0o600 });
  await chmod(secretsFile, 0o600);
  return { configFile, configuration, directory, secrets, secretsFile };
}

test("resolves the exact guarded Production interview fingerprints", async () => {
  const value = await fixture();
  try {
    const result = await resolveLiveKitProductionInterviewAuthorizationInput({
      configFile: value.configFile,
      secretsFile: value.secretsFile,
      repoRoot: process.cwd(),
    });
    const secretSha256 = sha256(Buffer.from(value.secrets));
    assert.deepEqual(result, {
      action: LIVEKIT_PRODUCTION_INTERVIEW_ACTION,
      configurationSha256: sha256(Buffer.from(value.configuration)),
      targetFingerprint: sha256(
        [
          "livekit",
          "production",
          "interview",
          LIVEKIT_PRODUCTION_INTERVIEW_URL,
          LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID,
          "runtime-secrets-sha256",
          secretSha256,
        ].join(":")
      ),
    });
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("uses the same canonical identity and target-material shape as deploy", async () => {
  const deploySource = await readFile(
    join(repoRoot, "agent", "interview", "deploy.sh"),
    "utf8"
  );

  assert.ok(
    deploySource.includes(
      `canonical_project_host="${LIVEKIT_PRODUCTION_INTERVIEW_URL.slice(6)}"`
    )
  );
  assert.ok(
    deploySource.includes(
      `canonical_agent_id="${LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID}"`
    )
  );
  assert.match(
    deploySource,
    /livekit:production:interview:\$target_url:\$expected_agent_id:runtime-secrets-sha256:/
  );
});

test("rejects target skew, symlinked config, and malformed secrets", async () => {
  const value = await fixture();
  try {
    await writeFile(
      value.configFile,
      '[project]\nsubdomain = "wrong"\n[agent]\nid = "CA_yawKG67rCMG4"\n'
    );
    await assert.rejects(
      resolveLiveKitProductionInterviewAuthorizationInput({
        configFile: value.configFile,
        secretsFile: value.secretsFile,
        repoRoot: process.cwd(),
      }),
      { message: "livekit_production_config_identity_invalid" }
    );

    await writeFile(value.configFile, value.configuration);
    const linkedConfig = join(value.directory, "linked.toml");
    await symlink(value.configFile, linkedConfig);
    await assert.rejects(
      resolveLiveKitProductionInterviewAuthorizationInput({
        configFile: linkedConfig,
        secretsFile: value.secretsFile,
        repoRoot: process.cwd(),
      }),
      { message: "livekit_production_config_path_invalid" }
    );

    await writeFile(value.secretsFile, `${value.secrets}EXTRA=value\n`, {
      mode: 0o600,
    });
    await assert.rejects(
      resolveLiveKitProductionInterviewAuthorizationInput({
        configFile: value.configFile,
        secretsFile: value.secretsFile,
        repoRoot: process.cwd(),
      }),
      { message: "livekit_runtime_secrets_invalid" }
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("prepares and verifies without printing fingerprints or secret material", async () => {
  const value = await fixture();
  const stdout = [];
  const stderr = [];
  const prepared = [];
  const verified = [];
  const candidateSha = "b".repeat(40);
  try {
    const prepareStatus = await runLiveKitProductionInterviewAuthorizationCli({
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
      stderr: { write: (text) => stderr.push(text) },
      prepare: async (input) => prepared.push(input),
      verify: async (input) => verified.push(input),
      resolveCandidate: async () => candidateSha,
    });
    const verifyStatus = await runLiveKitProductionInterviewAuthorizationCli({
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
      stderr: { write: (text) => stderr.push(text) },
      prepare: async (input) => prepared.push(input),
      verify: async (input) => verified.push(input),
      resolveCandidate: async () => candidateSha,
    });

    assert.equal(prepareStatus, 0);
    assert.equal(verifyStatus, 0);
    assert.equal(prepared.length, 1);
    assert.equal(verified.length, 1);
    assert.equal(prepared[0].action, LIVEKIT_PRODUCTION_INTERVIEW_ACTION);
    assert.equal(verified[0].action, LIVEKIT_PRODUCTION_INTERVIEW_ACTION);
    assert.equal(await prepared[0].resolveCandidate(repoRoot), candidateSha);
    assert.equal(await verified[0].resolveCandidate(repoRoot), candidateSha);
    assert.deepEqual(stdout, [
      '{"result":"unsigned_payload_written"}\n',
      '{"result":"authorization_valid"}\n',
    ]);
    assert.deepEqual(stderr, []);
    assert.doesNotMatch(stdout.join(""), /a{32}|k{25}|[a-f0-9]{64}/);
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("fails closed when the clean candidate differs from the reviewed main SHA", async () => {
  const value = await fixture();
  try {
    await assert.rejects(
      runLiveKitProductionInterviewAuthorizationCli({
        argv: [
          "prepare",
          "--expected-candidate-sha",
          "c".repeat(40),
          "--config-file",
          value.configFile,
          "--secrets-file",
          value.secretsFile,
          "--output-path",
          join(value.directory, "unsigned.json"),
        ],
        prepare: async (input) => input.resolveCandidate(repoRoot),
        resolveCandidate: async () => "d".repeat(40),
      }),
      { message: "livekit_production_candidate_mismatch" }
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

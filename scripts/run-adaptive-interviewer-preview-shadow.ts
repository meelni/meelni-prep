#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";
import {
  createDurablePreviewShadowCohortStopEvent,
  createDurablePreviewShadowControlPlaneStore,
  type DurablePreviewShadowRun,
  type PreviewShadowCohortStopReason,
} from "../lib/db/adaptive-interviewer-preview-shadow-control-plane";
import {
  PRODUCTION_PROJECT_SHADOW_AGENT_ID,
  PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL,
  PRODUCTION_PROJECT_SHADOW_LIVEKIT_URL,
  assertCurrentProductionProjectShadowDeployment,
  buildProductionProjectShadowRuntimeSecrets,
  consumeProductionProjectShadowCellAuthorization,
  productionProjectShadowCellAuthorizationInput,
} from "../lib/operations/adaptive-interviewer-production-project-shadow";
import * as schema from "../lib/db/schema";
import {
  PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE,
  assertPreviewShadowExternalCreateTarget,
  assertPreviewShadowExternalDirectory,
  readPreviewShadowPrivateFile,
} from "../lib/operations/adaptive-interviewer-preview-shadow-owner";
import { resolveCleanGitCandidate } from "../lib/operations/production-action-authorization.mjs";
import {
  authenticatePreviewShadowOwnerDecision,
  type PreviewShadowActivationContext,
  type PreviewShadowOwnerKeyRegistry,
} from "../lib/security/adaptive-interviewer-preview-shadow-owner-decision";
import { createDurablePreviewShadowControlPlaneWorkflow } from "../lib/workflows/adaptive-interviewer-preview-shadow-control-plane";
import { createPreviewShadowRehearsalWorkflow } from "../lib/workflows/adaptive-interviewer-preview-shadow-rehearsal";
import {
  PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
  PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
} from "../lib/workflows/adaptive-interviewer-preview-shadow-activation";
import {
  createLiveKitInterviewProvider,
  type LiveKitEnvironment,
} from "@meelni/integrations";
import { writePrivateFileCreateOnly } from "../lib/operations/production-action-owner-tooling.mjs";
import { getSupabaseEnvironmentIdentityPolicy } from "./supabase-environment-guard.mjs";

const REGISTRY = join(
  process.cwd(),
  "config",
  "adaptive-interviewer-preview-shadow-owner-keys.json"
);
const CELL_INTENT_VERSION =
  "adaptive-interviewer-preview-shadow-operator-cell-intent.v1";
const CELL_CONNECTION_VERSION =
  "adaptive-interviewer-preview-shadow-operator-cell-connection.v1";
const PREVIEW_LIVEKIT_URL = "wss://meelni-preview-dk7443ua.livekit.cloud";
const PREVIEW_AGENT_NAME = "meelni-preview-interview";
const ROUNDS = new Set(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.rounds
);
const CONDITIONS = new Set(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.voice_conditions
);

export async function runPreviewShadowOperatorCli(
  argv = process.argv.slice(2),
  stdout: { write(value: string): unknown } = process.stdout
): Promise<number> {
  const [command, ...raw] = argv;
  const options = parseOptions(raw);
  if (command === "activate") {
    assertOnly(options, [
      "packet-directory",
      "artifact-path",
      "env-file",
      "output-path",
      "key-registry-path",
    ]);
    const result = await activate({
      packetDirectory: required(options, "packet-directory"),
      artifactPath: required(options, "artifact-path"),
      envFile: required(options, "env-file"),
      outputPath: required(options, "output-path"),
      keyRegistryPath: options["key-registry-path"] ?? REGISTRY,
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "prepare-staging-activation-request") {
    assertOnly(options, ["packet-directory", "artifact-path", "output-path"]);
    const result = await prepareStagingActivationRequest({
      packetDirectory: required(options, "packet-directory"),
      artifactPath: required(options, "artifact-path"),
      outputPath: required(options, "output-path"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "start-cell") {
    assertOnly(options, [
      "activation-path",
      "cell-directory",
      "env-file",
      "expected-revision",
      "expires-at",
      "room-metadata-path",
      "round",
      "voice-condition",
    ]);
    const result = await startCell({
      activationPath: required(options, "activation-path"),
      cellDirectory: required(options, "cell-directory"),
      envFile: required(options, "env-file"),
      expectedRevision: Number(required(options, "expected-revision")),
      expiresAt: required(options, "expires-at"),
      roomMetadataPath: required(options, "room-metadata-path"),
      round: required(options, "round"),
      voiceCondition: required(options, "voice-condition"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "prepare-production-project-runtime") {
    assertOnly(options, [
      "activation-path",
      "control-plane-url",
      "ordinary-secrets-path",
      "output-path",
    ]);
    const result = await prepareProductionProjectRuntime({
      activationPath: required(options, "activation-path"),
      controlPlaneUrl: required(options, "control-plane-url"),
      ordinarySecretsPath: required(options, "ordinary-secrets-path"),
      outputPath: required(options, "output-path"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "prepare-production-project-cell") {
    assertOnly(options, [
      "activation-path",
      "cell-directory",
      "control-plane-url",
      "deployment-version",
      "expected-revision",
      "expires-at",
      "round",
      "voice-condition",
    ]);
    const result = await prepareProductionProjectCell({
      activationPath: required(options, "activation-path"),
      cellDirectory: required(options, "cell-directory"),
      controlPlaneUrl: required(options, "control-plane-url"),
      deploymentVersion: required(options, "deployment-version"),
      expectedRevision: Number(required(options, "expected-revision")),
      expiresAt: required(options, "expires-at"),
      round: required(options, "round"),
      voiceCondition: required(options, "voice-condition"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "start-production-project-cell") {
    assertOnly(options, [
      "activation-path",
      "cell-directory",
      "control-plane-url",
      "deployment-version",
      "env-file",
      "expected-revision",
      "expires-at",
      "production-authorization-path",
      "room-metadata-path",
      "round",
      "voice-condition",
    ]);
    const result = await startProductionProjectCell({
      activationPath: required(options, "activation-path"),
      cellDirectory: required(options, "cell-directory"),
      controlPlaneUrl: required(options, "control-plane-url"),
      deploymentVersion: required(options, "deployment-version"),
      envFile: required(options, "env-file"),
      expectedRevision: Number(required(options, "expected-revision")),
      expiresAt: required(options, "expires-at"),
      productionAuthorizationPath: required(
        options,
        "production-authorization-path"
      ),
      roomMetadataPath: required(options, "room-metadata-path"),
      round: required(options, "round"),
      voiceCondition: required(options, "voice-condition"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  if (command === "stop") {
    assertOnly(options, [
      "activation-path",
      "env-file",
      "expected-revision",
      "packet-directory",
      "reason",
      "evidence-sha256",
    ]);
    const result = await stopRun({
      activationPath: required(options, "activation-path"),
      envFile: required(options, "env-file"),
      expectedRevision: Number(required(options, "expected-revision")),
      packetDirectory: required(options, "packet-directory"),
      reason: required(options, "reason"),
      evidenceSha256: required(options, "evidence-sha256"),
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }
  stdout.write(usage());
  return command ? 1 : 0;
}

async function activate(input: {
  packetDirectory: string;
  artifactPath: string;
  envFile: string;
  outputPath: string;
  keyRegistryPath: string;
}) {
  const repoRoot = await realpath(process.cwd());
  const packetDirectory = await assertPreviewShadowExternalDirectory(
    input.packetDirectory,
    repoRoot
  );
  const candidateGitSha = resolveCleanGitCandidate(repoRoot);
  const [authorizationText, artifactText, registryText, capabilityText] =
    await Promise.all([
      readPreviewShadowPrivateFile(
        join(packetDirectory, "authorization.json"),
        repoRoot
      ),
      readPreviewShadowPrivateFile(input.artifactPath, repoRoot),
      readFile(input.keyRegistryPath, "utf8"),
      readPreviewShadowPrivateFile(
        join(packetDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
        repoRoot
      ),
    ]);
  const context = activationContext(candidateGitSha);
  const keyRegistry = JSON.parse(registryText) as PreviewShadowOwnerKeyRegistry;
  const authorization = JSON.parse(authorizationText) as unknown;
  const artifact = JSON.parse(artifactText) as unknown;
  const now = wholeSecond(new Date());
  const environment = await loadPreviewControlPlaneEnvironment(
    input.envFile,
    repoRoot
  );
  const { client, database } = connect(environment.DATABASE_URL);
  try {
    const store = createDurablePreviewShadowControlPlaneStore(database);
    const workflow = createDurablePreviewShadowControlPlaneWorkflow({
      store,
      ownerDecisionVerifier: {
        verify: (request) => authenticatePreviewShadowOwnerDecision(request),
      },
      ownerKeyRegistry: keyRegistry,
      clock: () => now,
    });
    const activated = await workflow.activate({
      artifact,
      authorization,
      context,
      runControlCapability: capabilityText.trim(),
    });
    const output = await assertPreviewShadowExternalCreateTarget(
      input.outputPath,
      repoRoot
    );
    await writePrivateFileCreateOnly(
      output,
      `${JSON.stringify(
        {
          contract_version: PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
          outcome: activated.outcome,
          run: activated.run,
        },
        null,
        2
      )}\n`
    );
    return publicRunResult("activated", activated.run);
  } finally {
    await client.end();
  }
}

async function prepareStagingActivationRequest(input: {
  packetDirectory: string;
  artifactPath: string;
  outputPath: string;
}) {
  const repoRoot = await realpath(process.cwd());
  const packetDirectory = await assertPreviewShadowExternalDirectory(
    input.packetDirectory,
    repoRoot
  );
  const [authorizationText, artifactText, capabilityText] = await Promise.all([
    readPreviewShadowPrivateFile(
      join(packetDirectory, "authorization.json"),
      repoRoot
    ),
    readPreviewShadowPrivateFile(input.artifactPath, repoRoot),
    readPreviewShadowPrivateFile(
      join(packetDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
      repoRoot
    ),
  ]);
  const authorization = parseJson(
    authorizationText,
    "preview_shadow_operator_authorization_invalid"
  );
  const artifact = parseJson(
    artifactText,
    "preview_shadow_operator_artifact_invalid"
  );
  const output = await assertPreviewShadowExternalCreateTarget(
    input.outputPath,
    repoRoot
  );
  const request = `${JSON.stringify({
    contract_version: PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
    action: "activate",
    payload: {
      artifact,
      authorization,
      run_control_capability: capabilityText.trim(),
    },
  })}\n`;
  if (Buffer.byteLength(request, "utf8") > 64 * 1_024) {
    throw new Error("preview_shadow_operator_activation_request_invalid");
  }
  await writePrivateFileCreateOnly(output, request);
  return {
    result: "staging_activation_request_prepared",
    candidate_git_sha: resolveCleanGitCandidate(repoRoot),
  };
}

async function startCell(input: {
  activationPath: string;
  cellDirectory: string;
  envFile: string;
  expectedRevision: number;
  expiresAt: string;
  roomMetadataPath: string;
  round: string;
  voiceCondition: string;
}) {
  const cell = await prepareCell(input);
  const { repoRoot, cellDirectory, run, binding, intent } = cell;
  const metadata = parseJson(
    await readPreviewShadowPrivateFile(input.roomMetadataPath, repoRoot),
    "preview_shadow_operator_room_metadata_invalid"
  );
  const environment = await loadPreviewEnvironment(input.envFile, repoRoot);
  const { client, database } = connect(environment.DATABASE_URL);
  try {
    const store = createDurablePreviewShadowControlPlaneStore(database);
    const workflow = createPreviewShadowRehearsalWorkflow({
      store,
      livekitProvider: createLiveKitInterviewProvider(),
    });
    const result = await workflow.start({
      allocation: {
        runId: run.run_id,
        expectedRevision: input.expectedRevision,
        sessionBindingSha256: binding,
        expiresAt: canonicalTimestamp(input.expiresAt),
        workerEvidenceCapability: intent.worker_evidence_capability,
        terminationCapability: intent.termination_capability,
      },
      room: {
        agentName: PREVIEW_AGENT_NAME,
        identity: "preview-shadow-owner",
        participantName: "Preview Shadow Owner",
        roomName: `preview-shadow-${binding}`,
        metadata,
        env: previewLiveKitEnvironment(environment),
      },
    });
    if (result.outcome === "started") {
      const connectionPath = await assertPreviewShadowExternalCreateTarget(
        join(cellDirectory, "connection.json"),
        repoRoot
      );
      await writePrivateFileCreateOnly(
        connectionPath,
        `${JSON.stringify(
          {
            contract_version: CELL_CONNECTION_VERSION,
            run_id: result.run.run_id,
            lease_id: result.lease_id,
            round: input.round,
            voice_condition: input.voiceCondition,
            room: result.room,
          },
          null,
          2
        )}\n`
      );
    }
    return {
      result: `preview_shadow_cell_${result.outcome}`,
      run_id: result.run.run_id,
      revision: result.run.revision,
      stopped: result.run.stopped,
      round: input.round,
      voice_condition: input.voiceCondition,
      ...(result.outcome === "provider_failed"
        ? {
            provider_error_code: result.provider_error_code,
            retryable: result.retryable,
          }
        : {}),
    };
  } finally {
    await client.end();
  }
}

async function prepareProductionProjectCell(input: {
  activationPath: string;
  cellDirectory: string;
  controlPlaneUrl: string;
  deploymentVersion: string;
  expectedRevision: number;
  expiresAt: string;
  round: string;
  voiceCondition: string;
}) {
  const cell = await prepareCell(input);
  const authorization = productionProjectShadowCellAuthorizationInput({
    runId: cell.run.run_id,
    candidateGitSha: cell.run.candidate_git_sha,
    expectedRevision: input.expectedRevision,
    sessionBindingSha256: cell.binding,
    expiresAt: canonicalTimestamp(input.expiresAt),
    round: input.round,
    voiceCondition: input.voiceCondition,
    controlPlaneUrl: input.controlPlaneUrl,
    deploymentVersion: input.deploymentVersion,
  });
  return {
    result: "production_project_shadow_cell_prepared",
    action: authorization.action,
    provider: authorization.provider,
    candidate_git_sha: cell.run.candidate_git_sha,
    configuration_sha256: authorization.configurationSha256,
    target_fingerprint: authorization.targetFingerprint,
    run_id: cell.run.run_id,
    expected_revision: input.expectedRevision,
    round: input.round,
    voice_condition: input.voiceCondition,
    expires_at: input.expiresAt,
    livekit_deployment_version: input.deploymentVersion,
  };
}

async function prepareProductionProjectRuntime(input: {
  activationPath: string;
  controlPlaneUrl: string;
  ordinarySecretsPath: string;
  outputPath: string;
}) {
  if (input.controlPlaneUrl !== PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL) {
    throw new Error("production_project_shadow_runtime_invalid");
  }
  const repoRoot = await realpath(process.cwd());
  const activation = parseJson(
    await readPreviewShadowPrivateFile(input.activationPath, repoRoot),
    "preview_shadow_operator_activation_invalid"
  ) as { contract_version?: string; run?: DurablePreviewShadowRun };
  if (
    activation.contract_version !== PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION ||
    !activation.run ||
    activation.run.candidate_git_sha !== resolveCleanGitCandidate(repoRoot)
  ) {
    throw new Error("preview_shadow_operator_activation_invalid");
  }
  const ordinarySecrets = await readPreviewShadowPrivateFile(
    input.ordinarySecretsPath,
    repoRoot
  );
  const combined = buildProductionProjectShadowRuntimeSecrets({
    ordinarySecrets,
    runId: activation.run.run_id,
    candidateGitSha: activation.run.candidate_git_sha,
    controlPlaneUrl: input.controlPlaneUrl,
  });
  const output = await assertPreviewShadowExternalCreateTarget(
    input.outputPath,
    repoRoot
  );
  await writePrivateFileCreateOnly(output, combined);
  return {
    result: "production_project_shadow_runtime_written",
    run_id: activation.run.run_id,
    candidate_git_sha: activation.run.candidate_git_sha,
  };
}

async function startProductionProjectCell(input: {
  activationPath: string;
  cellDirectory: string;
  controlPlaneUrl: string;
  deploymentVersion: string;
  envFile: string;
  expectedRevision: number;
  expiresAt: string;
  productionAuthorizationPath: string;
  roomMetadataPath: string;
  round: string;
  voiceCondition: string;
}) {
  const cell = await prepareCell(input);
  const { repoRoot, run, binding, intent } = cell;
  const authorization = productionProjectShadowCellAuthorizationInput({
    runId: run.run_id,
    candidateGitSha: run.candidate_git_sha,
    expectedRevision: input.expectedRevision,
    sessionBindingSha256: binding,
    expiresAt: canonicalTimestamp(input.expiresAt),
    round: input.round,
    voiceCondition: input.voiceCondition,
    controlPlaneUrl: input.controlPlaneUrl,
    deploymentVersion: input.deploymentVersion,
  });
  const metadata = parseJson(
    await readPreviewShadowPrivateFile(input.roomMetadataPath, repoRoot),
    "preview_shadow_operator_room_metadata_invalid"
  );
  const environment = await loadProductionProjectShadowEnvironment(
    input.envFile,
    repoRoot
  );
  assertCurrentProductionProjectShadowDeployment({
    credentials: {
      url: environment.LIVEKIT_URL,
      apiKey: environment.LIVEKIT_API_KEY,
      apiSecret: environment.LIVEKIT_API_SECRET,
    },
    expectedCandidateSha: run.candidate_git_sha,
    expectedVersion: input.deploymentVersion,
  });
  await consumeProductionProjectShadowCellAuthorization({
    authorizationPath: input.productionAuthorizationPath,
    expected: authorization,
    repoRoot,
  });
  const { client, database } = connect(environment.DATABASE_URL);
  try {
    const store = createDurablePreviewShadowControlPlaneStore(database);
    const workflow = createPreviewShadowRehearsalWorkflow({
      store,
      livekitProvider: createLiveKitInterviewProvider(),
    });
    const result = await workflow.start({
      allocation: {
        runId: run.run_id,
        expectedRevision: input.expectedRevision,
        sessionBindingSha256: binding,
        expiresAt: canonicalTimestamp(input.expiresAt),
        workerEvidenceCapability: intent.worker_evidence_capability,
        terminationCapability: intent.termination_capability,
      },
      room: {
        agentName: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
        identity: "production-project-shadow-owner",
        participantName: "Production Project Shadow Owner",
        roomName: `preview-shadow-${binding}`,
        metadata,
        env: productionProjectLiveKitEnvironment(environment),
      },
    });
    if (result.outcome === "started") {
      const connectionPath = await assertPreviewShadowExternalCreateTarget(
        join(cell.cellDirectory, "connection.json"),
        repoRoot
      );
      await writePrivateFileCreateOnly(
        connectionPath,
        `${JSON.stringify(
          {
            contract_version: CELL_CONNECTION_VERSION,
            topology: "production_project_shadow",
            run_id: result.run.run_id,
            lease_id: result.lease_id,
            round: input.round,
            voice_condition: input.voiceCondition,
            room: result.room,
          },
          null,
          2
        )}\n`
      );
    }
    return {
      result: `production_project_shadow_cell_${result.outcome}`,
      run_id: result.run.run_id,
      revision: result.run.revision,
      stopped: result.run.stopped,
      round: input.round,
      voice_condition: input.voiceCondition,
      ...(result.outcome === "provider_failed"
        ? {
            provider_error_code: result.provider_error_code,
            retryable: result.retryable,
          }
        : {}),
    };
  } finally {
    await client.end();
  }
}

async function prepareCell(input: {
  activationPath: string;
  cellDirectory: string;
  expectedRevision: number;
  expiresAt: string;
  round: string;
  voiceCondition: string;
}) {
  if (
    !ROUNDS.has(input.round as never) ||
    !CONDITIONS.has(input.voiceCondition as never) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new Error("preview_shadow_operator_cell_invalid");
  }
  canonicalTimestamp(input.expiresAt);
  const repoRoot = await realpath(process.cwd());
  const cellDirectory = await assertPreviewShadowExternalDirectory(
    input.cellDirectory,
    repoRoot
  );
  const activation = parseJson(
    await readPreviewShadowPrivateFile(input.activationPath, repoRoot),
    "preview_shadow_operator_activation_invalid"
  ) as { contract_version?: string; run?: DurablePreviewShadowRun };
  if (
    activation.contract_version !== PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION ||
    !activation.run ||
    activation.run.candidate_git_sha !== resolveCleanGitCandidate(repoRoot)
  ) {
    throw new Error("preview_shadow_operator_activation_invalid");
  }
  const run = activation.run;
  const binding = createHash("sha256")
    .update(CELL_INTENT_VERSION)
    .update("\0")
    .update(
      JSON.stringify({
        run_id: run.run_id,
        round: input.round,
        voice_condition: input.voiceCondition,
      })
    )
    .digest("hex");
  const intentPath = join(cellDirectory, "cell-intent.json");
  let intent: {
    contract_version: string;
    run_id: string;
    round: string;
    voice_condition: string;
    session_binding_sha256: string;
    worker_evidence_capability: string;
    termination_capability: string;
  };
  try {
    intent = parseJson(
      await readPreviewShadowPrivateFile(intentPath, repoRoot),
      "preview_shadow_operator_cell_intent_invalid"
    ) as typeof intent;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
    intent = {
      contract_version: CELL_INTENT_VERSION,
      run_id: run.run_id,
      round: input.round,
      voice_condition: input.voiceCondition,
      session_binding_sha256: binding,
      worker_evidence_capability: randomBytes(32).toString("base64url"),
      termination_capability: randomBytes(32).toString("base64url"),
    };
    await writePrivateFileCreateOnly(
      intentPath,
      `${JSON.stringify(intent, null, 2)}\n`
    );
  }
  if (
    intent.contract_version !== CELL_INTENT_VERSION ||
    intent.run_id !== run.run_id ||
    intent.round !== input.round ||
    intent.voice_condition !== input.voiceCondition ||
    intent.session_binding_sha256 !== binding
  ) {
    throw new Error("preview_shadow_operator_cell_conflict");
  }
  return { repoRoot, cellDirectory, run, binding, intent };
}

async function stopRun(input: {
  activationPath: string;
  envFile: string;
  expectedRevision: number;
  packetDirectory: string;
  reason: string;
  evidenceSha256: string;
}) {
  const repoRoot = await realpath(process.cwd());
  const activation = parseJson(
    await readPreviewShadowPrivateFile(input.activationPath, repoRoot),
    "preview_shadow_operator_activation_invalid"
  ) as { contract_version?: string; run?: DurablePreviewShadowRun };
  if (
    activation.contract_version !== PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION ||
    !activation.run ||
    activation.run.candidate_git_sha !== resolveCleanGitCandidate(repoRoot) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new Error("preview_shadow_operator_activation_invalid");
  }
  const packetDirectory = await assertPreviewShadowExternalDirectory(
    input.packetDirectory,
    repoRoot
  );
  const capability = await readPreviewShadowPrivateFile(
    join(packetDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
    repoRoot
  );
  const environment = await loadPreviewControlPlaneEnvironment(
    input.envFile,
    repoRoot
  );
  const { client, database } = connect(environment.DATABASE_URL);
  try {
    const store = createDurablePreviewShadowControlPlaneStore(database);
    const event = createDurablePreviewShadowCohortStopEvent({
      contract_version:
        "adaptive-interviewer-preview-shadow-cohort-stop-event.v1",
      run_id: activation.run.run_id,
      reason: input.reason as PreviewShadowCohortStopReason,
      evidence_sha256: input.evidenceSha256,
      observed_at: wholeSecond(new Date()).toISOString(),
    });
    const result = await store.recordCohortStopEvent({
      runId: activation.run.run_id,
      expectedRevision: input.expectedRevision,
      runControlCapability: capability.trim(),
      event,
    });
    return publicRunResult("stopped", result.run);
  } finally {
    await client.end();
  }
}

async function loadPreviewEnvironment(path: string, repoRoot: string) {
  const contents = await readPreviewShadowPrivateFile(path, repoRoot);
  return parsePreviewShadowLiveKitEnvironment(contents);
}

async function loadPreviewControlPlaneEnvironment(
  path: string,
  repoRoot: string
) {
  const contents = await readPreviewShadowPrivateFile(path, repoRoot);
  return parsePreviewShadowControlPlaneEnvironment(contents);
}

export function parsePreviewShadowControlPlaneEnvironment(contents: string) {
  if (Buffer.byteLength(contents, "utf8") > 64 * 1_024) {
    throw new Error("preview_shadow_operator_environment_invalid");
  }
  const env = parseEnv(contents);
  const databaseUrl = env.DATABASE_URL;
  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl,
    environment: env.MEELNI_ENV_PULL_ENVIRONMENT,
    expectedEnvironment: "preview",
    productionProjectRef: env.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF,
    vercelEnvironment: env.VERCEL_ENV,
  });
  if (
    !policy.allowed ||
    policy.environmentIdentity !== "preview" ||
    env.VERCEL_ENV !== "preview" ||
    env.VERCEL_TARGET_ENV !== "staging"
  ) {
    throw new Error("preview_shadow_operator_environment_invalid");
  }
  return { DATABASE_URL: databaseUrl as string };
}

export function parsePreviewShadowLiveKitEnvironment(contents: string) {
  const controlPlane = parsePreviewShadowControlPlaneEnvironment(contents);
  const env = parseEnv(contents);
  if (
    env.LIVEKIT_URL !== PREVIEW_LIVEKIT_URL ||
    env.NEXT_PUBLIC_LIVEKIT_URL !== PREVIEW_LIVEKIT_URL ||
    env.LIVEKIT_INTERVIEW_AGENT_NAME !== PREVIEW_AGENT_NAME ||
    !env.LIVEKIT_API_KEY ||
    !env.LIVEKIT_API_SECRET
  ) {
    throw new Error("preview_shadow_operator_environment_invalid");
  }
  return {
    ...controlPlane,
    LIVEKIT_URL: env.LIVEKIT_URL,
    LIVEKIT_API_KEY: env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: env.LIVEKIT_API_SECRET,
    LIVEKIT_INTERVIEW_AGENT_NAME: env.LIVEKIT_INTERVIEW_AGENT_NAME,
  };
}

async function loadProductionProjectShadowEnvironment(
  path: string,
  repoRoot: string
) {
  const contents = await readPreviewShadowPrivateFile(path, repoRoot);
  if (Buffer.byteLength(contents, "utf8") > 64 * 1_024) {
    throw new Error("production_project_shadow_operator_environment_invalid");
  }
  const env = parseEnv(contents);
  const databaseUrl = env.DATABASE_URL;
  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl,
    environment: env.MEELNI_ENV_PULL_ENVIRONMENT,
    expectedEnvironment: "preview",
    productionProjectRef: env.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF,
    vercelEnvironment: env.VERCEL_ENV,
  });
  if (
    !policy.allowed ||
    policy.environmentIdentity !== "preview" ||
    env.VERCEL_ENV !== "preview" ||
    env.VERCEL_TARGET_ENV !== "staging" ||
    env.LIVEKIT_URL !== PRODUCTION_PROJECT_SHADOW_LIVEKIT_URL ||
    env.LIVEKIT_INTERVIEW_AGENT_NAME !== PRODUCTION_PROJECT_SHADOW_AGENT_ID ||
    !env.LIVEKIT_API_KEY ||
    !env.LIVEKIT_API_SECRET
  ) {
    throw new Error("production_project_shadow_operator_environment_invalid");
  }
  return {
    DATABASE_URL: databaseUrl as string,
    LIVEKIT_URL: env.LIVEKIT_URL,
    LIVEKIT_API_KEY: env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: env.LIVEKIT_API_SECRET,
    LIVEKIT_INTERVIEW_AGENT_NAME: env.LIVEKIT_INTERVIEW_AGENT_NAME,
  };
}

function connect(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { client, database: drizzle(client, { schema }) };
}

function previewLiveKitEnvironment(
  env: Awaited<ReturnType<typeof loadPreviewEnvironment>>
): LiveKitEnvironment {
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    interviewAgentName: PREVIEW_AGENT_NAME,
  };
}

function productionProjectLiveKitEnvironment(
  env: Awaited<ReturnType<typeof loadProductionProjectShadowEnvironment>>
): LiveKitEnvironment {
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    interviewAgentName: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
  };
}

function activationContext(
  candidateGitSha: string
): PreviewShadowActivationContext {
  return {
    candidateGitSha,
    previewShadowConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selectedCandidateConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    targetStage: "preview_shadow",
    targetEnvironment: "preview_staging",
    targetCohort: "shadow",
    exposure: "none",
  };
}

function publicRunResult(result: string, run: DurablePreviewShadowRun) {
  return {
    result,
    run_id: run.run_id,
    candidate_git_sha: run.candidate_git_sha,
    preview_shadow_configuration_sha256:
      run.preview_shadow_configuration_sha256,
    revision: run.revision,
    allocated_session_count: run.allocated_session_count,
    reconciled_spend_nano_usd: run.reconciled_spend_nano_usd,
    outstanding_session_reservations_nano_usd:
      run.outstanding_session_reservations_nano_usd,
    stopped: run.stopped,
    authorization_expires_at: run.authorization_expires_at,
  };
}

function canonicalTimestamp(value: string): string {
  if (value.length !== 24)
    throw new Error("preview_shadow_operator_time_invalid");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("preview_shadow_operator_time_invalid");
  }
  return value;
}

function wholeSecond(value: Date): Date {
  return new Date(Math.floor(value.getTime() / 1_000) * 1_000);
}

function parseOptions(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("preview_shadow_operator_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("preview_shadow_operator_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function parseJson(contents: string, code: string): unknown {
  if (Buffer.byteLength(contents, "utf8") > 64 * 1_024) {
    throw new Error(code);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(code);
  }
}

function assertOnly(options: Record<string, string>, allowed: string[]) {
  if (Object.keys(options).some((key) => !allowed.includes(key))) {
    throw new Error("preview_shadow_operator_option_unknown");
  }
}

function required(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) throw new Error(`preview_shadow_operator_${name}_required`);
  return value;
}

function usage() {
  return [
    "Preview-shadow operator",
    "",
    "activate --packet-directory PATH --artifact-path PATH --env-file PATH --output-path PATH",
    "prepare-staging-activation-request --packet-directory PATH --artifact-path PATH --output-path PATH",
    "start-cell --activation-path PATH --cell-directory PATH --env-file PATH --expected-revision N --expires-at ISO --room-metadata-path PATH --round ROUND --voice-condition CONDITION",
    "prepare-production-project-runtime --activation-path PATH --control-plane-url URL --ordinary-secrets-path PATH --output-path PATH",
    "prepare-production-project-cell --activation-path PATH --cell-directory PATH --control-plane-url URL --deployment-version VERSION --expected-revision N --expires-at ISO --round ROUND --voice-condition CONDITION",
    "start-production-project-cell --activation-path PATH --cell-directory PATH --control-plane-url URL --deployment-version VERSION --env-file PATH --expected-revision N --expires-at ISO --production-authorization-path PATH --room-metadata-path PATH --round ROUND --voice-condition CONDITION",
    "stop --activation-path PATH --packet-directory PATH --env-file PATH --expected-revision N --reason REASON --evidence-sha256 HASH",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPreviewShadowOperatorCli()
    .then((status) => {
      process.exitCode = status;
    })
    .catch(() => {
      process.stderr.write("preview_shadow_operator_failed\n");
      process.exitCode = 1;
    });
}

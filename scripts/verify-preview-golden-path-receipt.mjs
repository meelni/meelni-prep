import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_RECEIPT_BYTES = 64 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROUND_TYPES = new Set([
  "behavioral",
  "product_sense",
  "execution",
  "strategy",
]);

export function validatePreviewGoldenPathReceipt(
  value,
  expectations,
  options = {}
) {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? 2 * 60 * 60 * 1000;
  const receipt = record(value, "receipt");

  exactKeys(receipt, [
    "contract",
    "version",
    "rehearsalId",
    "observedAt",
    "deployment",
    "providerIdentity",
    "correlation",
    "assertions",
  ]);
  exact(receipt.contract, "meelni_preview_golden_path", "contract");
  exact(receipt.version, 1, "version");
  safeId(receipt.rehearsalId, "rehearsalId");
  freshTimestamp(receipt.observedAt, now, maxAgeMs, "observedAt");

  validateDeployment(receipt.deployment, expectations);
  validateProviderIdentity(receipt.providerIdentity, expectations);
  validateCorrelation(receipt.correlation);
  validateAssertions(receipt.assertions, expectations);

  return {
    synthetic: "meelni_preview_golden_path",
    version: 1,
    status: "passed",
    code: "preview_golden_path_verified",
    commitSha: expectations.commitSha,
    deploymentId: expectations.deploymentId,
    receiptSha256: createHash("sha256")
      .update(stableSerialize(receipt))
      .digest("hex"),
  };
}

function validateDeployment(value, expectations) {
  const deployment = record(value, "deployment");
  exactKeys(deployment, ["environment", "id", "url", "commitSha", "branch"]);
  exact(deployment.environment, "preview", "deployment.environment");
  exact(deployment.id, expectations.deploymentId, "deployment.id");
  exact(deployment.commitSha, expectations.commitSha, "deployment.commitSha");
  exact(deployment.branch, expectations.branch, "deployment.branch");
  exact(deployment.url, expectations.deploymentUrl, "deployment.url");

  if (!COMMIT_SHA.test(deployment.commitSha)) fail("deployment_commit_invalid");
  if (!/^dpl_[A-Za-z0-9]+$/.test(deployment.id)) {
    fail("deployment_id_invalid");
  }
  const url = parseHttpsUrl(deployment.url, "deployment_url_invalid");
  if (!url.hostname.endsWith(".vercel.app") || url.pathname !== "/") {
    fail("deployment_url_invalid");
  }
}

function validateProviderIdentity(value, expectations) {
  const identity = record(value, "providerIdentity");
  exactKeys(identity, [
    "supabaseProjectRef",
    "livekitProjectId",
    "livekitAgentId",
    "livekitAgentVersion",
    "livekitDispatchName",
    "inngestEnvironment",
  ]);
  for (const [key, expected] of [
    ["supabaseProjectRef", expectations.supabaseProjectRef],
    ["livekitProjectId", expectations.livekitProjectId],
    ["livekitAgentId", expectations.livekitAgentId],
    ["livekitDispatchName", expectations.livekitDispatchName],
    ["inngestEnvironment", expectations.inngestEnvironment],
  ]) {
    exact(identity[key], expected, `providerIdentity.${key}`);
  }
  safeId(identity.livekitAgentVersion, "providerIdentity.livekitAgentVersion");
}

function validateCorrelation(value) {
  const correlation = record(value, "correlation");
  exactKeys(correlation, [
    "sessionIdSha256",
    "roomNameSha256",
    "startAttemptIdMatchesSessionId",
  ]);
  if (!SHA256.test(correlation.sessionIdSha256)) {
    fail("session_correlation_hash_invalid");
  }
  if (!SHA256.test(correlation.roomNameSha256)) {
    fail("room_correlation_hash_invalid");
  }
  truth(
    correlation.startAttemptIdMatchesSessionId,
    "stable_start_identity_failed"
  );
}

function validateAssertions(value, expectations) {
  const assertions = record(value, "assertions");
  exactKeys(assertions, [
    "defaultOffBefore",
    "syntheticAccount",
    "trial",
    "selectedQuestion",
    "livekit",
    "durableTranscript",
    "terminal",
    "feedback",
    "isolation",
    "defaultOffAfter",
    "cleanup",
  ]);
  validateDefaultOff(assertions.defaultOffBefore, "default_off_before");
  validateSyntheticAccount(assertions.syntheticAccount);
  validateTrial(assertions.trial);
  validateSelectedQuestion(assertions.selectedQuestion);
  validateLiveKit(assertions.livekit, expectations);
  validateDurableTranscript(assertions.durableTranscript);
  validateTerminal(assertions.terminal);
  validateFeedback(assertions.feedback, expectations);
  validateIsolation(assertions.isolation);
  validateDefaultOff(assertions.defaultOffAfter, "default_off_after");
  validateCleanup(assertions.cleanup);

  const tier = assertions.terminal.feedbackTier;
  exact(assertions.feedback.evaluationState, tier, "feedback.evaluationState");
}

function validateDefaultOff(value, prefix) {
  const assertion = record(value, prefix);
  exactKeys(assertion, ["httpStatus", "errorCode", "mutationDelta"]);
  exact(assertion.httpStatus, 403, `${prefix}.httpStatus`);
  exact(
    assertion.errorCode,
    "interview_practice_unavailable",
    `${prefix}.errorCode`
  );
  const delta = record(assertion.mutationDelta, `${prefix}.mutationDelta`);
  exactKeys(delta, ["sessions", "creditTransactions", "rooms", "dispatches"]);
  for (const key of Object.keys(delta))
    exact(delta[key], 0, `${prefix}.${key}`);
}

function validateSyntheticAccount(value) {
  const assertion = record(value, "syntheticAccount");
  exactKeys(assertion, ["fresh", "authenticated", "customerRecordUsed"]);
  truth(assertion.fresh, "synthetic_account_not_fresh");
  truth(assertion.authenticated, "synthetic_account_not_authenticated");
  exact(
    assertion.customerRecordUsed,
    false,
    "syntheticAccount.customerRecordUsed"
  );
}

function validateTrial(value) {
  const assertion = record(value, "trial");
  exactKeys(assertion, [
    "catalogId",
    "grantCount",
    "grantTransactionCount",
    "originalCredits",
    "consumedCredits",
    "remainingCredits",
    "reservedCredits",
  ]);
  exact(assertion.catalogId, "trial", "trial.catalogId");
  exact(assertion.grantCount, 1, "trial.grantCount");
  exact(assertion.grantTransactionCount, 1, "trial.grantTransactionCount");
  exact(assertion.originalCredits, 2, "trial.originalCredits");
  exact(assertion.consumedCredits, 1, "trial.consumedCredits");
  exact(assertion.remainingCredits, 1, "trial.remainingCredits");
  exact(assertion.reservedCredits, 0, "trial.reservedCredits");
}

function validateSelectedQuestion(value) {
  const assertion = record(value, "selectedQuestion");
  exactKeys(assertion, [
    "roundType",
    "startResponseMatched",
    "roomMetadataMatched",
    "firstQuestionObserved",
    "containsContent",
  ]);
  if (!ROUND_TYPES.has(assertion.roundType))
    fail("selected_question_round_invalid");
  truth(assertion.startResponseMatched, "selected_question_start_mismatch");
  truth(assertion.roomMetadataMatched, "selected_question_metadata_mismatch");
  truth(assertion.firstQuestionObserved, "selected_question_not_observed");
  exact(assertion.containsContent, false, "selectedQuestion.containsContent");
}

function validateLiveKit(value, expectations) {
  const assertion = record(value, "livekit");
  exactKeys(assertion, [
    "agentStatus",
    "dispatchName",
    "dispatchCount",
    "candidateJoined",
    "agentJoined",
    "runtimeActivated",
  ]);
  exact(assertion.agentStatus, "running", "livekit.agentStatus");
  exact(
    assertion.dispatchName,
    expectations.livekitDispatchName,
    "livekit.dispatchName"
  );
  exact(assertion.dispatchCount, 1, "livekit.dispatchCount");
  truth(assertion.candidateJoined, "livekit_candidate_not_joined");
  truth(assertion.agentJoined, "livekit_agent_not_joined");
  truth(assertion.runtimeActivated, "livekit_runtime_not_activated");
}

function validateDurableTranscript(value) {
  const assertion = record(value, "durableTranscript");
  exactKeys(assertion, [
    "contractVersion",
    "turnCount",
    "candidateTurnCount",
    "substantiveCandidateTurnCount",
    "durationSeconds",
    "allPersisted",
    "allSessionCorrelated",
    "allRoomCorrelated",
    "containsContent",
  ]);
  exact(assertion.contractVersion, 2, "durableTranscript.contractVersion");
  atLeast(assertion.turnCount, 5, "durable_transcript_turns_insufficient");
  atLeast(
    assertion.candidateTurnCount,
    3,
    "durable_candidate_turns_insufficient"
  );
  atLeast(
    assertion.substantiveCandidateTurnCount,
    3,
    "durable_substantive_turns_insufficient"
  );
  atLeast(
    assertion.durationSeconds,
    300,
    "durable_transcript_duration_insufficient"
  );
  truth(assertion.allPersisted, "durable_transcript_not_persisted");
  truth(assertion.allSessionCorrelated, "durable_transcript_session_mismatch");
  truth(assertion.allRoomCorrelated, "durable_transcript_room_mismatch");
  exact(assertion.containsContent, false, "durableTranscript.containsContent");
}

function validateTerminal(value) {
  const assertion = record(value, "terminal");
  exactKeys(assertion, [
    "lifecycleState",
    "terminalReason",
    "feedbackTier",
    "usableEvidence",
    "creditSettlement",
    "roomCleanupStatus",
  ]);
  exact(assertion.lifecycleState, "completed", "terminal.lifecycleState");
  exact(assertion.terminalReason, "user_end", "terminal.terminalReason");
  if (
    assertion.feedbackTier !== "partial" &&
    assertion.feedbackTier !== "full"
  ) {
    fail("terminal_feedback_tier_invalid");
  }
  truth(assertion.usableEvidence, "terminal_usable_evidence_missing");
  exact(assertion.creditSettlement, "consume", "terminal.creditSettlement");
  if (
    !new Set(["deleted", "already_absent"]).has(assertion.roomCleanupStatus)
  ) {
    fail("terminal_room_cleanup_unacknowledged");
  }
}

function validateFeedback(value, expectations) {
  const assertion = record(value, "feedback");
  exactKeys(assertion, [
    "dispatchStatus",
    "finalStatus",
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "modelVersion",
    "evaluationState",
    "strengthCount",
    "improvementCount",
    "containsContent",
    "providerCallCount",
    "providerWorstCaseNanoUsd",
    "hardSpendCapNanoUsd",
  ]);
  exact(assertion.dispatchStatus, "dispatched", "feedback.dispatchStatus");
  exact(assertion.finalStatus, "completed", "feedback.finalStatus");
  exact(assertion.schemaVersion, "feedback.v2", "feedback.schemaVersion");
  exact(
    assertion.promptVersion,
    "feedback.prompt.v2",
    "feedback.promptVersion"
  );
  exact(
    assertion.rubricVersion,
    "pm-feedback-rubric.v2",
    "feedback.rubricVersion"
  );
  exact(
    assertion.modelVersion,
    expectations.feedbackModel,
    "feedback.modelVersion"
  );
  atLeast(assertion.strengthCount, 1, "feedback_strengths_missing");
  atLeast(assertion.improvementCount, 1, "feedback_improvements_missing");
  exact(assertion.containsContent, false, "feedback.containsContent");
  integerBetween(
    assertion.providerCallCount,
    1,
    3,
    "feedback_provider_calls_invalid"
  );
  integerBetween(
    assertion.hardSpendCapNanoUsd,
    1,
    100_000_000,
    "feedback_spend_cap_invalid"
  );
  integerBetween(
    assertion.providerWorstCaseNanoUsd,
    0,
    assertion.hardSpendCapNanoUsd - 1,
    "feedback_spend_cap_exceeded"
  );
}

function validateIsolation(value) {
  const assertion = record(value, "isolation");
  exactKeys(assertion, [
    "candidateOnlyGate",
    "unrelatedAccountDenied",
    "customerDataUsed",
    "productionDataUsed",
    "productionMutationCount",
  ]);
  truth(assertion.candidateOnlyGate, "candidate_only_gate_not_proven");
  truth(assertion.unrelatedAccountDenied, "unrelated_account_not_denied");
  exact(assertion.customerDataUsed, false, "isolation.customerDataUsed");
  exact(assertion.productionDataUsed, false, "isolation.productionDataUsed");
  exact(
    assertion.productionMutationCount,
    0,
    "isolation.productionMutationCount"
  );
}

function validateCleanup(value) {
  const assertion = record(value, "cleanup");
  exactKeys(assertion, [
    "syntheticAccountRemoved",
    "livekitRoomAbsent",
    "temporaryGateRuleRemoved",
    "bypassRevokedOrRotated",
    "temporaryArtifactsRemoved",
  ]);
  for (const [key, item] of Object.entries(assertion)) {
    truth(item, `cleanup_${key}_failed`);
  }
}

export function parseExpectations(args) {
  const pairs = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      fail("arguments_invalid");
    }
    if (pairs.has(key)) fail("arguments_duplicate");
    pairs.set(key, value);
  }
  const required = {
    receiptPath: "--receipt",
    commitSha: "--expect-head",
    deploymentId: "--expect-deployment-id",
    deploymentUrl: "--expect-deployment-url",
    branch: "--expect-branch",
    supabaseProjectRef: "--expect-supabase-project-ref",
    livekitProjectId: "--expect-livekit-project-id",
    livekitAgentId: "--expect-livekit-agent-id",
    livekitDispatchName: "--expect-livekit-dispatch-name",
    inngestEnvironment: "--expect-inngest-environment",
    feedbackModel: "--expect-feedback-model",
  };
  const parsed = Object.fromEntries(
    Object.entries(required).map(([name, flag]) => {
      const value = pairs.get(flag);
      if (!value) fail("arguments_missing");
      return [name, value];
    })
  );
  if (pairs.size !== Object.keys(required).length) fail("arguments_unknown");
  if (!COMMIT_SHA.test(parsed.commitSha)) fail("expected_head_invalid");
  parseHttpsUrl(parsed.deploymentUrl, "expected_deployment_url_invalid");
  return parsed;
}

export async function readPrivateReceipt(path) {
  if (!isAbsolute(path)) fail("receipt_path_not_absolute");
  const absolute = resolve(path);
  const stats = await lstat(absolute).catch(() => fail("receipt_unavailable"));
  if (!stats.isFile() || stats.isSymbolicLink()) fail("receipt_file_invalid");
  if ((stats.mode & 0o077) !== 0) fail("receipt_permissions_invalid");
  if (stats.size > MAX_RECEIPT_BYTES) fail("receipt_too_large");
  const text = await readFile(absolute, "utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("receipt_json_invalid");
  }
  return value;
}

function freshTimestamp(value, now, maxAgeMs, name) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) {
    fail(`${name}_invalid`);
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value
  ) {
    fail(`${name}_invalid`);
  }
  const age = now.getTime() - timestamp;
  if (age < -60_000 || age > maxAgeMs) fail(`${name}_stale`);
}

function parseHttpsUrl(value, code) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(code);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail(code);
  }
  return url;
}

function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name}_invalid`);
  }
  return value;
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail("receipt_shape_invalid");
  }
}

function exact(value, expected, name) {
  if (value !== expected) fail(`${name}_mismatch`);
}

function safeId(value, name) {
  if (typeof value !== "string" || !SAFE_ID.test(value))
    fail(`${name}_invalid`);
}

function truth(value, code) {
  if (value !== true) fail(code);
}

function atLeast(value, minimum, code) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code);
}

function integerBetween(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code);
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

async function main() {
  try {
    const expectations = parseExpectations(process.argv.slice(2));
    const receipt = await readPrivateReceipt(expectations.receiptPath);
    const result = validatePreviewGoldenPathReceipt(receipt, expectations);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        synthetic: "meelni_preview_golden_path",
        version: 1,
        status: "failed",
        code:
          error && typeof error === "object" && typeof error.code === "string"
            ? error.code
            : "receipt_verification_failed",
      })}\n`
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256,
  createProductionAdaptiveAdmission,
  resolveProductionAdaptiveAdmissionConfig,
} from "./adaptive-interviewer-production-admission";

const SHA = "a".repeat(40);
const SESSION = "10000000-0000-4000-8000-000000000001";
const ROOM = `interview-${SESSION}`;
const DEADLINE = "2026-08-21T20:30:00.000Z";

test("production admission is absent by default and partial config fails closed", () => {
  assert.deepEqual(resolveProductionAdaptiveAdmissionConfig({}), {
    status: "disabled",
  });
  assert.deepEqual(
    resolveProductionAdaptiveAdmissionConfig({
      MEELNI_ADAPTIVE_INTERVIEWER_STAGE: "candidate_default",
    }),
    { status: "invalid", reason: "partial_or_invalid_configuration" }
  );
});

test("exact all-five Production configuration signs deterministic session authority", () => {
  const resolution = resolveProductionAdaptiveAdmissionConfig(enabledEnv());
  assert.equal(resolution.status, "enabled");
  if (resolution.status !== "enabled") return;
  const first = createProductionAdaptiveAdmission({
    config: resolution.config,
    crossServiceSecret: "test-livekit-secret",
    sessionId: SESSION,
    roomName: ROOM,
    requestFingerprint: "b".repeat(64),
    deadlineAt: DEADLINE,
  });
  const replay = createProductionAdaptiveAdmission({
    config: resolution.config,
    crossServiceSecret: "test-livekit-secret",
    sessionId: SESSION,
    roomName: ROOM,
    requestFingerprint: "b".repeat(64),
    deadlineAt: DEADLINE,
  });
  assert.deepEqual(replay, first);
  assert.equal(first.stage, "candidate_default");
  assert.equal(first.environment, "production");
  assert.equal(first.maximum_attempts, 10);
  assert.equal(first.director_deadline_ms, 750);
  assert.match(first.signature.value, /^[a-f0-9]{64}$/u);
  assert.equal(
    first.signature.value,
    "f0fabef7f113b0b0d5496377fdf3d1262fb5ba2d6f1284106f9552d1b57b3cd7"
  );
  assert.doesNotMatch(JSON.stringify(first), /test-livekit-secret/u);
});

test("admission key is domain-separated from direct use of the cross-service root", () => {
  const resolution = resolveProductionAdaptiveAdmissionConfig(enabledEnv());
  assert.equal(resolution.status, "enabled");
  if (resolution.status !== "enabled") return;
  const admission = createProductionAdaptiveAdmission({
    config: resolution.config,
    crossServiceSecret: "test-livekit-secret",
    sessionId: SESSION,
    roomName: ROOM,
    requestFingerprint: "b".repeat(64),
    deadlineAt: DEADLINE,
  });
  assert.notEqual(
    admission.signature.value,
    "fea3c0422300347b1aa7d96b236a0f4287169410ebb832356fbef59fa1926399"
  );
});

test("every launch flag and exact candidate/config binding is required", () => {
  for (const key of [
    "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
    "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
    "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
    "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
    "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
  ] as const) {
    assert.equal(
      resolveProductionAdaptiveAdmissionConfig({
        ...enabledEnv(),
        [key]: "false",
      }).status,
      "invalid"
    );
  }
  assert.equal(
    resolveProductionAdaptiveAdmissionConfig({
      ...enabledEnv(),
      MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA: "not-a-sha",
    }).status,
    "invalid"
  );
});

function enabledEnv(): Record<string, string> {
  return {
    MEELNI_ADAPTIVE_INTERVIEWER_STAGE: "candidate_default",
    MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT: "production",
    MEELNI_ADAPTIVE_INTERVIEWER_COHORT: "canary",
    MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE: "default",
    MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256:
      ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256,
    MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA: SHA,
    MEELNI_INTERVIEW_BRIEF_V2_ENABLED: "true",
    MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED: "true",
    MEELNI_INTERVIEW_TOOLS_V1_ENABLED: "true",
    MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED: "true",
    MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: "true",
  };
}

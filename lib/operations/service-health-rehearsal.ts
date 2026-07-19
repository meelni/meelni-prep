import { createHash } from "node:crypto";

import type { ServiceHealthSyntheticResult } from "./service-health-synthetic";

interface RehearsalObservation {
  observedAt: string;
  result: ServiceHealthSyntheticResult;
}

interface ServiceHealthRehearsalEvidence {
  contract: "meelni_service_health_rehearsal_evidence";
  version: 1;
  environment: "preview";
  release: string;
  relaunchGate: "off";
  productionMutation: false;
  customerDataUsed: false;
  target: { originSha256: string; path: "/api/health" };
  baseline: RehearsalObservation;
  disturbance: {
    kind: "preview_synthetic_stripe_webhook_failure";
    fixtureSha256: string;
    inducedAt: string;
  };
  degradation: RehearsalObservation;
  alert: {
    receiptSha256: string;
    receivedAt: string;
    acknowledgedAt: string;
  };
  cleanup: { receiptSha256: string; completedAt: string };
  recovery: RehearsalObservation;
}

export interface ServiceHealthRehearsalVerification {
  verification: "meelni_service_health_rehearsal";
  version: 1;
  status: "verified" | "rejected";
  code: "rehearsal_evidence_verified" | "rehearsal_evidence_invalid";
  release: string | null;
  evidenceSha256: string | null;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const RELEASE_PATTERN = /^[0-9a-f]{40}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_DURATION_MS = 2 * 60 * 60 * 1000;

export function verifyServiceHealthRehearsalEvidence(
  value: unknown
): ServiceHealthRehearsalVerification {
  if (!isEvidence(value)) return rejected();

  const times = [
    value.baseline.observedAt,
    value.disturbance.inducedAt,
    value.degradation.observedAt,
    value.alert.receivedAt,
    value.alert.acknowledgedAt,
    value.cleanup.completedAt,
    value.recovery.observedAt,
  ].map(parseCanonicalTimestamp);
  if (
    times.some((time) => time === null) ||
    times.some((time, index) => index > 0 && time! < times[index - 1]!) ||
    times[times.length - 1]! - times[0]! > MAX_DURATION_MS
  ) {
    return rejected();
  }

  const evidenceSha256 = createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
  return {
    verification: "meelni_service_health_rehearsal",
    version: 1,
    status: "verified",
    code: "rehearsal_evidence_verified",
    release: value.release,
    evidenceSha256,
  };
}

function isEvidence(value: unknown): value is ServiceHealthRehearsalEvidence {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "contract",
      "version",
      "environment",
      "release",
      "relaunchGate",
      "productionMutation",
      "customerDataUsed",
      "target",
      "baseline",
      "disturbance",
      "degradation",
      "alert",
      "cleanup",
      "recovery",
    ]) ||
    value.contract !== "meelni_service_health_rehearsal_evidence" ||
    value.version !== 1 ||
    value.environment !== "preview" ||
    typeof value.release !== "string" ||
    !RELEASE_PATTERN.test(value.release) ||
    value.relaunchGate !== "off" ||
    value.productionMutation !== false ||
    value.customerDataUsed !== false
  ) {
    return false;
  }

  return (
    isTarget(value.target) &&
    isObservation(value.baseline, "health_endpoint_healthy", "passed") &&
    isDisturbance(value.disturbance) &&
    isObservation(value.degradation, "health_endpoint_degraded", "failed") &&
    isAlert(value.alert) &&
    isCleanup(value.cleanup) &&
    isObservation(value.recovery, "health_endpoint_healthy", "passed")
  );
}

function isTarget(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["originSha256", "path"]) &&
    typeof value.originSha256 === "string" &&
    HASH_PATTERN.test(value.originSha256) &&
    value.path === "/api/health"
  );
}

function isObservation(
  value: unknown,
  code: ServiceHealthSyntheticResult["code"],
  status: ServiceHealthSyntheticResult["status"]
) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["observedAt", "result"]) &&
    typeof value.observedAt === "string" &&
    isRecord(value.result) &&
    hasOnlyKeys(value.result, ["synthetic", "version", "status", "code"]) &&
    value.result.synthetic === "meelni_service_health" &&
    value.result.version === 1 &&
    value.result.status === status &&
    value.result.code === code
  );
}

function isDisturbance(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["kind", "fixtureSha256", "inducedAt"]) &&
    value.kind === "preview_synthetic_stripe_webhook_failure" &&
    typeof value.fixtureSha256 === "string" &&
    HASH_PATTERN.test(value.fixtureSha256) &&
    typeof value.inducedAt === "string"
  );
}

function isAlert(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["receiptSha256", "receivedAt", "acknowledgedAt"]) &&
    typeof value.receiptSha256 === "string" &&
    HASH_PATTERN.test(value.receiptSha256) &&
    typeof value.receivedAt === "string" &&
    typeof value.acknowledgedAt === "string"
  );
}

function isCleanup(value: unknown) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["receiptSha256", "completedAt"]) &&
    typeof value.receiptSha256 === "string" &&
    HASH_PATTERN.test(value.receiptSha256) &&
    typeof value.completedAt === "string"
  );
}

function parseCanonicalTimestamp(value: string): number | null {
  if (!UTC_PATTERN.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function rejected(): ServiceHealthRehearsalVerification {
  return {
    verification: "meelni_service_health_rehearsal",
    version: 1,
    status: "rejected",
    code: "rehearsal_evidence_invalid",
    release: null,
    evidenceSha256: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

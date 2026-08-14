import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseProviderFreeBakeoffConfig,
  runProviderFreeBakeoff,
  serializeProviderFreeBakeoffReport,
  type ProviderFreeBakeoffConfig,
} from "./provider-free-bakeoff";

const config = JSON.parse(
  readFileSync("config/feedback-provider-free-bakeoff.json", "utf8")
) as unknown;

test("provider-free bakeoff replays the existing calibration contract without a provider boundary", async () => {
  const report = await runProviderFreeBakeoff(config);

  assert.equal(report.execution.kind, "provider_free_deterministic_replay");
  assert.equal(report.execution.customerDataUsed, false);
  assert.equal(report.execution.providerCredentialRead, false);
  assert.equal(report.execution.paidProviderCalled, false);
  assert.equal(report.execution.productionConfigurationChanged, false);
  assert.equal(report.execution.defaultActivationChanged, false);
  assert.equal(report.candidates.length, 2);
  for (const candidate of report.candidates) {
    assert.equal(candidate.evidence.fullySyntheticCases, 40);
    assert.equal(candidate.evidence.scoredCases, 32);
    assert.equal(candidate.evidence.insufficientCases, 8);
    assert.equal(candidate.evidence.calibrationEvaluatorCalls, 64);
    assert.equal(candidate.evidence.measurementReplayCalls, 32);
    assert.equal(candidate.evidence.totalEvaluatorCalls, 96);
    assert.equal(candidate.evidence.providerCalls, 0);
    assert.equal(candidate.evidence.evidenceValidityRate, 1);
    assert.equal(candidate.evidence.structuredOutputAcceptedOutputs, 32);
    assert.equal(candidate.evidence.structuredOutputAcceptanceRate, 1);
    assert.equal(candidate.evidence.adjudicatedEvidenceMatchRate, 1);
    assert.equal(candidate.evidence.scoreBandAgreementRate, 1);
    assert.equal(candidate.evidence.insufficientHandlingRate, 1);
    assert.equal(candidate.evidence.deterministicHarness, "passed");
    assert.equal(candidate.conclusion, "deterministic_contract_passed");
  }
  assert.equal(report.evaluatorDecision.recommendedModelOrTier, null);
  assert.equal(
    report.evaluatorDecision.liveQualityLatencyEvidenceRequired,
    true
  );
});

test("evidence validity and structured-output acceptance remain separate report claims", async () => {
  const report = await runProviderFreeBakeoff(config);
  const evidence = report.candidates[0]!.evidence;

  assert.deepEqual(
    Object.keys(evidence).filter((key) => key.includes("ValidityRate")),
    ["evidenceValidityRate"]
  );
  assert.equal("schemaValidityRate" in evidence, false);
  assert.equal(evidence.evidenceValidityRate, 1);
  assert.equal(evidence.structuredOutputAcceptedOutputs, 32);
  assert.equal(evidence.structuredOutputAcceptanceRate, 1);
});

test("output ceiling uses only valid serialized outputs, conservative byte tokens, and explicit headroom", async () => {
  const report = await runProviderFreeBakeoff(config);
  const ceiling = report.outputTokenCeiling;

  assert.equal(ceiling.validMeasuredOutputs, 64);
  assert.equal(
    ceiling.maximumMeasuredOutputTokenUpperBound,
    ceiling.maximumMeasuredOutputBytes
  );
  assert.equal(ceiling.headroomBasisPoints, 2500);
  assert.equal(ceiling.roundTo, 128);
  assert.equal(ceiling.candidateMaxCompletionTokens % ceiling.roundTo, 0);
  assert.ok(
    ceiling.candidateMaxCompletionTokens >=
      Math.ceil(ceiling.maximumMeasuredOutputTokenUpperBound * 1.25)
  );
  assert.equal(ceiling.activated, false);
});

test("queue burst analysis isolates throttle, concurrency, claim, provider, validation, and persistence", async () => {
  const report = await runProviderFreeBakeoff(config);
  const baseline = report.queue.results.find(
    (result) =>
      result.evaluatorCandidateId === "accepted-baseline-replay" &&
      result.queuePolicyId === "current-global-throttle"
  );
  const candidate = report.queue.results.find(
    (result) =>
      result.evaluatorCandidateId === "accepted-baseline-replay" &&
      result.queuePolicyId === "bounded-concurrency-candidate"
  );

  assert.ok(baseline);
  assert.ok(candidate);
  assert.equal(baseline.totalJobs, 24);
  assert.equal(baseline.completedWithinDeadlineJobs, 20);
  assert.equal(baseline.expiredBeforeProviderJobs, 4);
  assert.equal(baseline.stagesMs.concurrencyWait.maximum, 0);
  assert.ok(baseline.stagesMs.throttleWait.maximum >= 120_000);
  assert.equal(candidate.completedWithinDeadlineJobs, 24);
  assert.equal(candidate.expiredBeforeProviderJobs, 0);
  assert.equal(candidate.stagesMs.throttleWait.maximum, 0);
  assert.ok(candidate.stagesMs.concurrencyWait.maximum > 0);
  assert.ok(candidate.stagesMs.total.maximum > 60_000);
  assert.ok(candidate.stagesMs.total.maximum < 90_000);
  assert.equal(candidate.stagesMs.claim.minimum, 750);
  assert.equal(candidate.stagesMs.validation.minimum, 250);
  assert.equal(candidate.stagesMs.persistence.minimum, 1000);
  assert.equal(
    report.queue.recommendation.status,
    "provider_free_candidate_ready_for_staging_review"
  );
  assert.equal(
    report.queue.recommendation.candidatePolicyId,
    "bounded-concurrency-candidate"
  );
  assert.equal(report.queue.recommendation.productionChangeAuthorized, false);
});

test("report bytes and hashes are deterministic and content-free", async () => {
  const first = await runProviderFreeBakeoff(config);
  const second = await runProviderFreeBakeoff(config);
  const serialized = serializeProviderFreeBakeoffReport(first);

  assert.equal(serializeProviderFreeBakeoffReport(second), serialized);
  assert.match(first.reproducibility.inputSha256, /^[a-f0-9]{64}$/);
  assert.match(first.reproducibility.reportSha256, /^[a-f0-9]{64}$/);
  for (const forbidden of [
    "working caregivers",
    "synthetic-calibration-user",
    "sessionId",
    "userId",
    "transcript",
    "providerPayload",
    "OPENAI_API_KEY",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("config parser is closed and configurable without model or provider settings", () => {
  const parsed = parseProviderFreeBakeoffConfig(config);
  const changed = structuredClone(parsed) as ProviderFreeBakeoffConfig & {
    interviewContent?: string;
  };
  changed.interviewContent = "must not cross the config boundary";

  assert.throws(
    () => parseProviderFreeBakeoffConfig(changed),
    /provider_free_bakeoff_config_schema_invalid/
  );
  assert.equal(
    Object.keys(parsed.evaluatorCandidates[0]!).includes("model"),
    false
  );
  assert.equal(
    Object.keys(parsed.evaluatorCandidates[0]!).includes("provider"),
    false
  );
});

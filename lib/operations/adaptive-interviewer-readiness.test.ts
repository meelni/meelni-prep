import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS,
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
  ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
  adaptiveInterviewerSelectedCandidateConfigurationSha256,
  parseAdaptiveInterviewerPreparationAuthorization,
  type AdaptiveInterviewerPreparationAuthorization,
  type AdaptiveInterviewerPreviewShadowSelection,
} from "@meelni/agent";
import { verifyProductionActionAuthorization } from "./production-action-authorization.mjs";

import {
  ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE,
  adaptiveInterviewerRolloutConfigurationSha256,
  buildAdaptiveInterviewerReadinessReport,
  serializeAdaptiveInterviewerReadinessReport,
  type AdaptiveInterviewerReadinessInputs,
} from "./adaptive-interviewer-readiness";

async function inputs(): Promise<AdaptiveInterviewerReadinessInputs> {
  const [
    benchmarkJson,
    adjudicationJson,
    adaptiveFeedbackSource,
    observabilityJson,
  ] = await Promise.all([
    readFile(ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.benchmark.path, "utf8"),
    readFile(ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adjudication.path, "utf8"),
    readFile(
      ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adaptiveFeedback.path,
      "utf8"
    ),
    readFile(ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.observability.path, "utf8"),
  ]);
  return {
    benchmarkJson,
    adjudicationJson,
    adaptiveFeedbackSource,
    observabilityJson,
  };
}

test("readiness report is deterministic, scoped, and held at synthetic", async () => {
  const evidence = await inputs();
  const first = buildAdaptiveInterviewerReadinessReport(evidence);
  const second = buildAdaptiveInterviewerReadinessReport(evidence);
  assert.deepEqual(second, first);
  assert.equal(
    first.evidence_scope.provenance,
    "fully_synthetic_provider_free"
  );
  assert.equal(first.evidence_scope.provider_calls, 0);
  assert.equal(first.evidence_scope.production_calls, 0);
  assert.equal(
    first.benchmark_evidence.adaptive_quality_improvement_observed,
    false
  );
  assert.equal(first.benchmark_evidence.shadow_entry_eligible, false);
  assert.equal(
    first.adaptive_feedback_evidence.live_feedback_outcomes_observed,
    0
  );
  assert.equal(first.observability_evidence.live_runtime_count, 0);
  assert.equal(first.readiness.system_recommendation, "hold_at_synthetic");
  assert.equal(first.readiness.owner_decision, "pending");
  assert.equal(first.rollout_policy.adaptive_flags_enabled, 0);
  assert.equal(first.rollout_policy.director_adapter_version, null);
  assert.equal(first.rollout_policy.director_model, null);
  assert.equal(first.owner_preparation_gate.selection_status, "unselected");
  assert.equal(first.owner_preparation_gate.selection_configuration, null);
  assert.equal(
    first.owner_preparation_gate.selected_candidate_configuration_sha256,
    null
  );
  assert.equal(
    first.owner_preparation_gate.parser_authenticates_human_identity,
    false
  );
  assert.equal(
    first.owner_preparation_gate
      .external_decision_reference_verification_required,
    true
  );
  assert.equal(
    first.owner_preparation_gate.second_live_authorization_rehearsal_matrix,
    "unbound_and_unperformed"
  );
  assert.equal(
    first.rollout_policy.active_session_immediate_revocation,
    "director_influence"
  );
  assert.equal(
    first.rollout_policy.active_session_shadow_stop,
    "reviewed_session_settle_or_shutdown_required"
  );
  assert.ok(!("immediate_rollback_order" in first.rollout_policy));
  assert.ok(
    first.readiness.blockers.includes(
      "in_flight_preview_shadow_settle_shutdown_rehearsal_not_run"
    )
  );
  assert.equal(
    first.rollout_policy.configuration_sha256,
    adaptiveInterviewerRolloutConfigurationSha256()
  );
  assert.match(serializeAdaptiveInterviewerReadinessReport(first), /\n$/);
});

test("every frozen evidence input is digest-bound and drift fails closed", async () => {
  const evidence = await inputs();
  for (const key of Object.keys(
    evidence
  ) as (keyof AdaptiveInterviewerReadinessInputs)[]) {
    assert.throws(
      () =>
        buildAdaptiveInterviewerReadinessReport({
          ...evidence,
          [key]: `${evidence[key]} `,
        }),
      /frozen_input_digest_mismatch/,
      key
    );
  }
});

test("owner adjudication cannot be broadened into runtime authority", async () => {
  const evidence = await inputs();
  const approval = JSON.parse(evidence.adjudicationJson);
  approval.authorityScope.runtimeBehaviorAuthority = true;
  const mutated = `${JSON.stringify(approval, null, 2)}\n`;
  assert.throws(
    () =>
      buildAdaptiveInterviewerReadinessReport({
        ...evidence,
        adjudicationJson: mutated,
      }),
    /frozen_input_digest_mismatch:adjudication/
  );
});

test("approved preparation authority is rejected by the Production verifier", () => {
  const candidateGitSha = "a".repeat(40);
  const repositoryRolloutConfigurationSha256 = "b".repeat(64);
  const selection: AdaptiveInterviewerPreviewShadowSelection = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
    director: {
      adapter_id: "example_director",
      adapter_version: "example-director.v1",
      provider: "example_provider",
      model: "example/model-v1",
    },
    preview_limits: {
      maximum_sessions: 10,
      maximum_spend_nano_usd: 5_000_000_000,
    },
    privacy_and_retention: {
      policy_version: ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION,
      policy_accepted: true,
      data_scope: "synthetic_owner_rehearsal_only",
      customer_data_allowed: false,
      provider_training_allowed: false,
      provider_policy_reference: "example/privacy-v1",
      maximum_provider_payload_retention_days: 0,
      maximum_transcript_retention_days: 7,
      maximum_raw_audio_retention_days: 0,
    },
    entry_thresholds: {
      minimum_completed_sessions: 8,
      minimum_quality_score_bps: 8_000,
      maximum_first_audio_p50_ms: 2_000,
      maximum_first_audio_p95_ms: 4_000,
      minimum_completion_rate_bps: 9_000,
      maximum_fallback_rate_bps: 500,
      maximum_tool_failure_rate_bps: 200,
      maximum_recommendation_age_ms: 3_000,
      minimum_recommendation_freshness_rate_bps: 9_500,
      minimum_interruption_recovery_rate_bps: 9_000,
      minimum_feedback_integrity_rate_bps: 9_500,
    },
    stop_thresholds: {
      maximum_cumulative_spend_nano_usd: 4_000_000_000,
      minimum_quality_score_bps: 7_000,
      maximum_first_audio_p50_ms: 3_000,
      maximum_first_audio_p95_ms: 6_000,
      minimum_completion_rate_bps: 8_000,
      maximum_fallback_rate_bps: 1_000,
      maximum_tool_failure_rate_bps: 500,
      maximum_recommendation_age_ms: 5_000,
      minimum_recommendation_freshness_rate_bps: 8_000,
      minimum_interruption_recovery_rate_bps: 8_000,
      minimum_feedback_integrity_rate_bps: 9_000,
    },
    non_tunable_hard_stops: {
      evidence_digest_drift: true,
      version_pin_mismatch: true,
      unauthorized_stage_or_cohort: true,
      deterministic_invariant_regression: true,
      any_session_or_transcript_loss: true,
      kill_switch_failure: true,
    },
  };
  const authorization: AdaptiveInterviewerPreparationAuthorization = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
    rollout_contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
    requested_authority: "prepare_isolated_preview_shadow_candidate_only",
    current_stage: "synthetic",
    future_live_stage: "preview_shadow",
    candidate_git_sha: candidateGitSha,
    repository_rollout_configuration_sha256:
      repositoryRolloutConfigurationSha256,
    selection_configuration: selection,
    selected_candidate_configuration_sha256:
      adaptiveInterviewerSelectedCandidateConfigurationSha256({
        candidateGitSha,
        repositoryRolloutConfigurationSha256,
        selectionConfiguration: selection,
      }),
    owner_decision: "approved",
    owner_decision_reference: "linear:SAV-476:comment:abc123",
    owner_decided_at: "2026-08-19T19:00:00.000Z",
    authorization_expires_at: "2026-08-20T19:00:00.000Z",
    candidate_preparation_authorized: true,
    rollout_transition_authorized: false,
    allowed_repository_actions:
      ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS,
    denied_authority: ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
  };

  const parsed = parseAdaptiveInterviewerPreparationAuthorization(
    authorization,
    {
      candidateGitSha,
      repositoryRolloutConfigurationSha256,
    },
    new Date("2026-08-19T20:00:00.000Z")
  );
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact: parsed,
        keyRegistry: {},
        expected: {},
        now: new Date("2026-08-19T20:00:00.000Z"),
      }),
    /authorization_artifact_invalid/
  );
});

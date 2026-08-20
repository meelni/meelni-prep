import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS,
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
  ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES,
  ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS,
  adaptiveInterviewerSelectedCandidateConfigurationSha256,
  assessAdaptiveInterviewerStageConfiguration,
  assessAdaptiveInterviewerTransition,
  createAdaptiveInterviewerOwnerRequest,
  parseAdaptiveInterviewerPreparationAuthorization,
  parseAdaptiveInterviewerPreparationAuthorizationJson,
  resolveAdaptiveInterviewerFlags,
  type AdaptiveInterviewerPreparationAuthorization,
  type AdaptiveInterviewerPreviewShadowSelection,
} from "./index";

const CANDIDATE_SHA = "a".repeat(40);
const CONFIG_SHA = "b".repeat(64);
const NOW = new Date("2026-08-19T20:00:00.000Z");

function selection(): AdaptiveInterviewerPreviewShadowSelection {
  return {
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
}

function preparationAuthorization(): AdaptiveInterviewerPreparationAuthorization {
  const selected = selection();
  return {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
    rollout_contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
    requested_authority: "prepare_isolated_preview_shadow_candidate_only",
    current_stage: "synthetic",
    future_live_stage: "preview_shadow",
    candidate_git_sha: CANDIDATE_SHA,
    repository_rollout_configuration_sha256: CONFIG_SHA,
    selection_configuration: selected,
    selected_candidate_configuration_sha256:
      adaptiveInterviewerSelectedCandidateConfigurationSha256({
        candidateGitSha: CANDIDATE_SHA,
        repositoryRolloutConfigurationSha256: CONFIG_SHA,
        selectionConfiguration: selected,
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
}

function copyAuthorization(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(preparationAuthorization())) as Record<
    string,
    unknown
  >;
}

test("rollout stages are ordered and require adjacent forward progress", () => {
  assert.deepEqual(ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES, [
    "disabled",
    "synthetic",
    "preview_shadow",
    "preview_influence",
    "production_shadow",
    "production_canary",
    "candidate_default",
  ]);
  assert.deepEqual(
    ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS.find(
      (stage) => stage.stage === "synthetic"
    )?.exit_requirements,
    [
      "frozen_evidence_digests_match",
      "provider_free_verification_passes",
      "selected_adapter_candidate_provider_free_validation_passes",
    ]
  );
  assert.ok(
    ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS.find(
      (stage) => stage.stage === "preview_shadow"
    )?.exit_requirements.includes("rollback_rehearsal_passed")
  );
  assert.ok(
    ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS.find(
      (stage) => stage.stage === "production_shadow"
    )?.hard_stop_signals.includes("evidence_digest_drift")
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "disabled",
      to: "synthetic",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: null,
    }),
    { accepted: true, reason: "adjacent_forward" }
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "synthetic",
      to: "production_shadow",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: null,
    }),
    { accepted: false, reason: "stage_skip_denied" }
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "production_canary",
      to: "production_shadow",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: null,
    }),
    { accepted: true, reason: "declared_rollback" }
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "production_shadow",
      to: "disabled",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: null,
    }),
    { accepted: true, reason: "declared_rollback" }
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "production_shadow",
      to: "preview_influence",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: null,
    }),
    { accepted: false, reason: "stage_skip_denied" }
  );
});

test("every Preview and Production forward step needs its own exact authorization", () => {
  const steps = [
    ["synthetic", "preview_shadow"],
    ["preview_shadow", "preview_influence"],
    ["preview_influence", "production_shadow"],
    ["production_shadow", "production_canary"],
    ["production_canary", "candidate_default"],
  ] as const;
  for (const [from, to] of steps) {
    assert.equal(
      assessAdaptiveInterviewerTransition({
        from,
        to,
        candidateGitSha: CANDIDATE_SHA,
        configurationSha256: CONFIG_SHA,
        ownerAuthorization: null,
      }).reason,
      "owner_authorization_required",
      to
    );
    assert.deepEqual(
      assessAdaptiveInterviewerTransition({
        from,
        to,
        candidateGitSha: CANDIDATE_SHA,
        configurationSha256: CONFIG_SHA,
        ownerAuthorization: {
          stage: to,
          candidate_git_sha: CANDIDATE_SHA,
          configuration_sha256: CONFIG_SHA,
        },
      }),
      { accepted: true, reason: "adjacent_forward" },
      to
    );
  }
});

test("forward authorization rejects every binding mismatch and malformed identity", () => {
  const transition = (input: {
    candidateGitSha?: string;
    configurationSha256?: string;
    authorizationStage?: "preview_shadow" | "preview_influence";
    authorizationCandidateSha?: string;
    authorizationConfigurationSha?: string;
  }) =>
    assessAdaptiveInterviewerTransition({
      from: "synthetic",
      to: "preview_shadow",
      candidateGitSha: input.candidateGitSha ?? CANDIDATE_SHA,
      configurationSha256: input.configurationSha256 ?? CONFIG_SHA,
      ownerAuthorization: {
        stage: input.authorizationStage ?? "preview_shadow",
        candidate_git_sha:
          input.authorizationCandidateSha ??
          input.candidateGitSha ??
          CANDIDATE_SHA,
        configuration_sha256:
          input.authorizationConfigurationSha ??
          input.configurationSha256 ??
          CONFIG_SHA,
      },
    });

  for (const [name, result] of [
    [
      "wrong target stage",
      transition({ authorizationStage: "preview_influence" }),
    ],
    [
      "wrong candidate SHA",
      transition({ authorizationCandidateSha: "c".repeat(40) }),
    ],
    [
      "wrong configuration digest",
      transition({ authorizationConfigurationSha: "d".repeat(64) }),
    ],
    [
      "identically malformed candidate SHA",
      transition({ candidateGitSha: "main" }),
    ],
    [
      "identically malformed configuration digest",
      transition({ configurationSha256: "configuration" }),
    ],
  ] as const) {
    assert.deepEqual(
      result,
      { accepted: false, reason: "owner_authorization_mismatch" },
      name
    );
  }

  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "preview_shadow",
      to: "preview_shadow",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256: CONFIG_SHA,
      ownerAuthorization: {
        stage: "preview_shadow",
        candidate_git_sha: CANDIDATE_SHA,
        configuration_sha256: CONFIG_SHA,
      },
    }),
    { accepted: false, reason: "same_stage" }
  );
});

test("all flags default off and only exact lowercase true is enabled", () => {
  assert.deepEqual(resolveAdaptiveInterviewerFlags({}), {
    brief_v2: false,
    controller_v1: false,
    tools_v1: false,
    director_shadow_v1: false,
    director_influence_v1: false,
  });
  for (const value of [" true", "true ", "TRUE", "True", "1", "yes", ""]) {
    assert.equal(
      resolveAdaptiveInterviewerFlags({
        MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: value,
      }).director_influence_v1,
      false,
      JSON.stringify(value)
    );
  }
  assert.equal(
    resolveAdaptiveInterviewerFlags({
      MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: "true",
    }).director_influence_v1,
    true
  );
});

test("synthetic stays inert and shadow requires pinned adapter and model", () => {
  assert.deepEqual(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "synthetic",
      env: {},
      directorAdapterVersion: null,
      directorModel: null,
    }),
    { accepted: true, reason: "matched" }
  );
  const shadowEnv = {
    MEELNI_INTERVIEW_BRIEF_V2_ENABLED: "true",
    MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED: "true",
    MEELNI_INTERVIEW_TOOLS_V1_ENABLED: "true",
    MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED: "true",
  };
  assert.equal(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "preview_shadow",
      env: shadowEnv,
      directorAdapterVersion: null,
      directorModel: null,
    }).reason,
    "adapter_required"
  );
  assert.deepEqual(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "preview_shadow",
      env: shadowEnv,
      directorAdapterVersion: "preview-director-adapter.v1",
      directorModel: "provider/model-version-v1",
    }),
    { accepted: true, reason: "matched" }
  );
});

test("kill-switch revocation moves influence to shadow without permissive parsing", () => {
  const influenceEnv = {
    MEELNI_INTERVIEW_BRIEF_V2_ENABLED: "true",
    MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED: "true",
    MEELNI_INTERVIEW_TOOLS_V1_ENABLED: "true",
    MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED: "true",
    MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: "true",
  };
  assert.equal(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "preview_influence",
      env: influenceEnv,
      directorAdapterVersion: "preview-director-adapter.v1",
      directorModel: "provider/model-version-v1",
    }).accepted,
    true
  );
  const revoked = {
    ...influenceEnv,
    MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: "false",
  };
  assert.deepEqual(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "preview_shadow",
      env: revoked,
      directorAdapterVersion: "preview-director-adapter.v1",
      directorModel: "provider/model-version-v1",
    }),
    { accepted: true, reason: "matched" }
  );
  assert.equal(
    assessAdaptiveInterviewerStageConfiguration({
      stage: "preview_influence",
      env: revoked,
      directorAdapterVersion: "preview-director-adapter.v1",
      directorModel: "provider/model-version-v1",
    }).reason,
    "flag_mismatch"
  );
});

test("owner request v2 remains a null pending template with no executable authority", () => {
  const request = createAdaptiveInterviewerOwnerRequest({
    candidateGitSha: CANDIDATE_SHA,
    repositoryRolloutConfigurationSha256: CONFIG_SHA,
  });
  assert.equal(
    request.contract_version,
    ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION
  );
  assert.equal(request.owner_decision, "pending");
  assert.equal(request.owner_decision_reference, null);
  assert.equal(request.owner_decided_at, null);
  assert.equal(request.authorization_expires_at, null);
  assert.equal(request.selection_configuration, null);
  assert.equal(request.selected_candidate_configuration_sha256, null);
  assert.equal(request.candidate_preparation_authorized, false);
  assert.equal(request.selection_template.director.provider, null);
  assert.equal(
    request.selection_template.entry_thresholds.maximum_first_audio_p50_ms,
    null
  );
  assert.equal(
    request.selection_template.entry_thresholds.maximum_first_audio_p95_ms,
    null
  );
  assert.equal(
    request.selection_template.non_tunable_hard_stops.kill_switch_failure,
    true
  );
  assert.equal(request.system_recommendation, "hold_at_synthetic");
  assert.equal(request.requested_work, "preview_shadow_candidate_preparation");
  assert.equal(request.future_live_stage, "preview_shadow");
  assert.equal(request.rollout_transition_authorized, false);
  assert.equal(
    request.requested_authority,
    "prepare_isolated_preview_shadow_candidate_only"
  );
  assert.deepEqual(request.allowed_repository_actions, [
    "implement_selected_director_adapter_candidate",
    "configure_selected_director_adapter_candidate",
    "add_provider_free_candidate_validation",
  ]);
  assert.ok(request.denied_authority.includes("provider_calls"));
  assert.ok(request.denied_authority.includes("preview_influence"));
  assert.ok(request.denied_authority.includes("production"));
  assert.equal(request.selection_constraints.spend_unit, "nano_usd_integer");
  assert.equal(
    request.selection_constraints.second_live_authorization_rehearsal_matrix,
    "unbound_and_unperformed"
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorization(
        request,
        {
          candidateGitSha: CANDIDATE_SHA,
          repositoryRolloutConfigurationSha256: CONFIG_SHA,
        },
        NOW
      ),
    /authorization_invalid/
  );
  assert.throws(
    () =>
      createAdaptiveInterviewerOwnerRequest({
        candidateGitSha: "main",
        repositoryRolloutConfigurationSha256: CONFIG_SHA,
      }),
    /binding_invalid/
  );
});

test("approved preparation authorization binds a closed value-bearing selection", () => {
  const authorization = preparationAuthorization();
  const parsed = parseAdaptiveInterviewerPreparationAuthorization(
    authorization,
    {
      candidateGitSha: CANDIDATE_SHA,
      repositoryRolloutConfigurationSha256: CONFIG_SHA,
    },
    NOW
  );
  assert.deepEqual(parsed, authorization);
  assert.equal(parsed.candidate_preparation_authorized, true);
  assert.equal(parsed.rollout_transition_authorized, false);
  assert.equal(
    parsed.selection_configuration.preview_limits.maximum_sessions,
    10
  );
  assert.equal(
    parsed.selection_configuration.entry_thresholds.maximum_first_audio_p50_ms,
    2_000
  );
  assert.equal(
    parsed.selection_configuration.entry_thresholds.maximum_first_audio_p95_ms,
    4_000
  );
});

test("selection digest is canonical across key order and changes for every selected value", () => {
  const baseline = selection();
  const digest = adaptiveInterviewerSelectedCandidateConfigurationSha256({
    candidateGitSha: CANDIDATE_SHA,
    repositoryRolloutConfigurationSha256: CONFIG_SHA,
    selectionConfiguration: baseline,
  });
  const reordered = reverseObjectKeys(baseline);
  assert.equal(
    adaptiveInterviewerSelectedCandidateConfigurationSha256({
      candidateGitSha: CANDIDATE_SHA,
      repositoryRolloutConfigurationSha256: CONFIG_SHA,
      selectionConfiguration: reordered,
    }),
    digest
  );
  assert.notEqual(
    adaptiveInterviewerSelectedCandidateConfigurationSha256({
      candidateGitSha: "c".repeat(40),
      repositoryRolloutConfigurationSha256: CONFIG_SHA,
      selectionConfiguration: baseline,
    }),
    digest
  );
  assert.notEqual(
    adaptiveInterviewerSelectedCandidateConfigurationSha256({
      candidateGitSha: CANDIDATE_SHA,
      repositoryRolloutConfigurationSha256: "d".repeat(64),
      selectionConfiguration: baseline,
    }),
    digest
  );

  const mutations: readonly ((
    value: AdaptiveInterviewerPreviewShadowSelection
  ) => void)[] = [
    (value) => (value.director.adapter_id = "second_example_director"),
    (value) => (value.director.adapter_version = "example-director.v2"),
    (value) => (value.director.provider = "second_example_provider"),
    (value) => (value.director.model = "example/model-v2"),
    (value) => (value.preview_limits.maximum_sessions = 11),
    (value) => (value.preview_limits.maximum_spend_nano_usd = 6_000_000_000),
    (value) =>
      (value.privacy_and_retention.provider_policy_reference =
        "example/privacy-v2"),
    (value) =>
      (value.privacy_and_retention.maximum_provider_payload_retention_days = 1),
    (value) =>
      (value.privacy_and_retention.maximum_transcript_retention_days = 8),
    (value) =>
      (value.privacy_and_retention.maximum_raw_audio_retention_days = 1),
    (value) => (value.entry_thresholds.minimum_completed_sessions = 7),
    (value) => (value.entry_thresholds.minimum_quality_score_bps = 7_900),
    (value) => (value.entry_thresholds.maximum_first_audio_p50_ms = 1_900),
    (value) => (value.entry_thresholds.maximum_first_audio_p95_ms = 3_900),
    (value) => (value.entry_thresholds.minimum_completion_rate_bps = 8_900),
    (value) => (value.entry_thresholds.maximum_fallback_rate_bps = 600),
    (value) => (value.entry_thresholds.maximum_tool_failure_rate_bps = 300),
    (value) => (value.entry_thresholds.maximum_recommendation_age_ms = 3_500),
    (value) =>
      (value.entry_thresholds.minimum_recommendation_freshness_rate_bps = 9_400),
    (value) =>
      (value.entry_thresholds.minimum_interruption_recovery_rate_bps = 8_900),
    (value) =>
      (value.entry_thresholds.minimum_feedback_integrity_rate_bps = 9_400),
    (value) =>
      (value.stop_thresholds.maximum_cumulative_spend_nano_usd = 3_000_000_000),
    (value) => (value.stop_thresholds.minimum_quality_score_bps = 6_900),
    (value) => (value.stop_thresholds.maximum_first_audio_p50_ms = 3_500),
    (value) => (value.stop_thresholds.maximum_first_audio_p95_ms = 6_500),
    (value) => (value.stop_thresholds.minimum_completion_rate_bps = 7_900),
    (value) => (value.stop_thresholds.maximum_fallback_rate_bps = 1_100),
    (value) => (value.stop_thresholds.maximum_tool_failure_rate_bps = 600),
    (value) => (value.stop_thresholds.maximum_recommendation_age_ms = 6_000),
    (value) =>
      (value.stop_thresholds.minimum_recommendation_freshness_rate_bps = 7_900),
    (value) =>
      (value.stop_thresholds.minimum_interruption_recovery_rate_bps = 7_900),
    (value) =>
      (value.stop_thresholds.minimum_feedback_integrity_rate_bps = 8_900),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const variant = JSON.parse(
      JSON.stringify(baseline)
    ) as AdaptiveInterviewerPreviewShadowSelection;
    mutate(variant);
    assert.notEqual(
      adaptiveInterviewerSelectedCandidateConfigurationSha256({
        candidateGitSha: CANDIDATE_SHA,
        repositoryRolloutConfigurationSha256: CONFIG_SHA,
        selectionConfiguration: variant,
      }),
      digest,
      `selected value ${index}`
    );
  }
});

test("preparation authorization rejects schema, JSON, numeric, time, and fixed-safety drift", () => {
  const expected = {
    candidateGitSha: CANDIDATE_SHA,
    repositoryRolloutConfigurationSha256: CONFIG_SHA,
  };
  const invalidObjects: Record<string, unknown>[] = [];

  const extra = copyAuthorization();
  extra.extra = true;
  invalidObjects.push(extra);
  const missing = copyAuthorization();
  delete missing.owner_decision_reference;
  invalidObjects.push(missing);
  const nestedExtra = copyAuthorization();
  selectionRecord(nestedExtra).director.secret = "not-allowed";
  invalidObjects.push(nestedExtra);
  const nestedMissing = copyAuthorization();
  delete selectionRecord(nestedMissing).entry_thresholds
    .maximum_first_audio_p50_ms;
  invalidObjects.push(nestedMissing);
  const unsafe = copyAuthorization();
  selectionRecord(unsafe).preview_limits.maximum_spend_nano_usd =
    Number.MAX_SAFE_INTEGER + 1;
  invalidObjects.push(unsafe);
  const coerced = copyAuthorization();
  selectionRecord(coerced).preview_limits.maximum_sessions = "10";
  invalidObjects.push(coerced);
  const fractional = copyAuthorization();
  selectionRecord(fractional).preview_limits.maximum_sessions = 1.5;
  invalidObjects.push(fractional);
  const notANumber = copyAuthorization();
  selectionRecord(notANumber).entry_thresholds.minimum_quality_score_bps = NaN;
  invalidObjects.push(notANumber);
  const privacy = copyAuthorization();
  selectionRecord(privacy).privacy_and_retention.customer_data_allowed = true;
  invalidObjects.push(privacy);
  for (const [field, invalid] of [
    ["policy_version", "adaptive-interviewer-preview-privacy.v2"],
    ["policy_accepted", false],
    ["data_scope", "customer_data"],
    ["provider_training_allowed", true],
    ["maximum_provider_payload_retention_days", 31],
    ["maximum_transcript_retention_days", 31],
    ["maximum_raw_audio_retention_days", 8],
  ] as const) {
    const value = copyAuthorization();
    selectionRecord(value).privacy_and_retention[field] = invalid;
    invalidObjects.push(value);
  }
  const hardStop = copyAuthorization();
  selectionRecord(hardStop).non_tunable_hard_stops.kill_switch_failure = false;
  invalidObjects.push(hardStop);
  const denial = copyAuthorization();
  denial.denied_authority = ["production"];
  invalidObjects.push(denial);
  const sparseAuthority = copyAuthorization();
  delete (sparseAuthority.allowed_repository_actions as unknown[])[1];
  invalidObjects.push(sparseAuthority);
  const hiddenExtra = copyAuthorization();
  Object.defineProperty(hiddenExtra, "hidden_extra", {
    value: true,
    enumerable: false,
  });
  invalidObjects.push(hiddenExtra);
  const symbolExtra = copyAuthorization();
  Object.defineProperty(symbolExtra, Symbol("extra"), {
    value: true,
    enumerable: false,
  });
  invalidObjects.push(symbolExtra);
  const futureDecision = copyAuthorization();
  futureDecision.owner_decided_at = "2026-08-19T21:00:00.000Z";
  invalidObjects.push(futureDecision);
  const expired = copyAuthorization();
  expired.authorization_expires_at = NOW.toISOString();
  invalidObjects.push(expired);
  const overlong = copyAuthorization();
  overlong.authorization_expires_at = "2026-08-27T19:00:00.000Z";
  invalidObjects.push(overlong);
  const fractionalTimestamp = copyAuthorization();
  fractionalTimestamp.owner_decided_at = "2026-08-19T19:00:00.001Z";
  invalidObjects.push(fractionalTimestamp);
  const reversedWindow = copyAuthorization();
  reversedWindow.authorization_expires_at =
    reversedWindow.owner_decided_at as string;
  invalidObjects.push(reversedWindow);
  const invalidClock = copyAuthorization();
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorization(
        invalidClock,
        expected,
        new Date("invalid")
      ),
    /authorization_invalid/
  );

  for (const [index, value] of invalidObjects.entries()) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreparationAuthorization(value, expected, NOW),
      /authorization_invalid|selection_invalid/,
      `invalid authorization ${index}`
    );
  }

  const duplicate = JSON.stringify(preparationAuthorization()).replace(
    '"owner_decision":"approved"',
    '"owner_decision":"pending","owner_decision":"approved"'
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorizationJson(
        duplicate,
        expected,
        NOW
      ),
    /authorization_json_invalid/
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorizationJson(
        `\u00a0${JSON.stringify(preparationAuthorization())}`,
        expected,
        NOW
      ),
    /authorization_json_invalid/
  );
});

test("preparation thresholds reject inverted p50/p95, entry/stop, sample, and spend bounds", () => {
  const mutate = (
    change: (value: AdaptiveInterviewerPreviewShadowSelection) => void
  ) => {
    const value = copyAuthorization();
    const selected =
      value.selection_configuration as AdaptiveInterviewerPreviewShadowSelection;
    change(selected);
    value.selected_candidate_configuration_sha256 =
      adaptiveInterviewerSelectedCandidateConfigurationSha256({
        candidateGitSha: CANDIDATE_SHA,
        repositoryRolloutConfigurationSha256: CONFIG_SHA,
        selectionConfiguration: selected,
      });
    return value;
  };
  const invalid = [
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.entry_thresholds.minimum_completed_sessions = 11),
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.entry_thresholds.maximum_first_audio_p50_ms = 4_001),
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.stop_thresholds.maximum_first_audio_p50_ms = 6_001),
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.stop_thresholds.minimum_quality_score_bps = 8_001),
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.stop_thresholds.maximum_fallback_rate_bps = 499),
    (value: AdaptiveInterviewerPreviewShadowSelection) =>
      (value.stop_thresholds.maximum_cumulative_spend_nano_usd = 5_000_000_001),
  ];
  for (const [index, change] of invalid.entries()) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreparationAuthorization(
          mutate(change),
          {
            candidateGitSha: CANDIDATE_SHA,
            repositoryRolloutConfigurationSha256: CONFIG_SHA,
          },
          NOW
        ),
      /selection_invalid/,
      `inverted threshold ${index}`
    );
  }
});

test("approved preparation record fails closed on every exact binding mismatch", () => {
  for (const value of [
    {
      expectedCandidate: "c".repeat(40),
      expectedConfiguration: CONFIG_SHA,
    },
    {
      expectedCandidate: CANDIDATE_SHA,
      expectedConfiguration: "d".repeat(64),
    },
  ]) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreparationAuthorization(
          preparationAuthorization(),
          {
            candidateGitSha: value.expectedCandidate,
            repositoryRolloutConfigurationSha256: value.expectedConfiguration,
          },
          NOW
        ),
      /binding_mismatch/
    );
  }
  const drift = copyAuthorization();
  selectionRecord(drift).director.model = "example/model-v2";
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorization(
        drift,
        {
          candidateGitSha: CANDIDATE_SHA,
          repositoryRolloutConfigurationSha256: CONFIG_SHA,
        },
        NOW
      ),
    /binding_mismatch/
  );
});

test("preparation authorization is not a rollout-stage authorization", () => {
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "synthetic",
      to: "preview_shadow",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256:
        preparationAuthorization().selected_candidate_configuration_sha256,
      ownerAuthorization: preparationAuthorization() as never,
    }),
    { accepted: false, reason: "owner_authorization_mismatch" }
  );
});

test("SAV-478 checked-in preparation authority is exact, current, and not live authority", () => {
  const contents = readFileSync(
    "docs/evidence/sav-478-director-adapter-preparation-authorization.json",
    "utf8"
  );
  const parsed = parseAdaptiveInterviewerPreparationAuthorizationJson(
    contents,
    {
      candidateGitSha: "0312c34c84509187649a6af46b6c8a21c6a398e5",
      repositoryRolloutConfigurationSha256:
        "ff50893d0bc9e3dea640e61323c79f4fe51381264ba98c6cec18f17b341cd042",
    },
    new Date("2026-08-20T04:43:27.000Z")
  );

  assert.equal(
    parsed.owner_decision_reference,
    "linear:SAV-476:comment:05d1d32b-a1aa-45ff-b83a-4645904b4398"
  );
  assert.equal(
    parsed.selected_candidate_configuration_sha256,
    "b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac"
  );
  assert.deepEqual(parsed.selection_configuration.director, {
    adapter_id: "meelni_director_openai_responses",
    adapter_version: "interview-director-adapter.openai-responses.v1",
    provider: "openai-api",
    model: "gpt-5.4-mini-2026-03-17",
  });
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "synthetic",
      to: "preview_shadow",
      candidateGitSha: parsed.candidate_git_sha,
      configurationSha256: parsed.selected_candidate_configuration_sha256,
      ownerAuthorization: parsed as never,
    }),
    { accepted: false, reason: "owner_authorization_mismatch" }
  );
});

test("canonical authority tuples are frozen against runtime mutation", () => {
  assert.equal(
    Object.isFrozen(
      ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS
    ),
    true
  );
  assert.equal(
    Object.isFrozen(ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY),
    true
  );
  assert.equal(
    Reflect.set(
      ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
      0,
      "provider_calls"
    ),
    false
  );
});

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, item]) => [key, reverseObjectKeys(item)])
  );
}

type MutableSelectionRecord = Record<
  | "director"
  | "preview_limits"
  | "privacy_and_retention"
  | "entry_thresholds"
  | "stop_thresholds"
  | "non_tunable_hard_stops",
  Record<string, unknown>
>;

function selectionRecord(
  value: Record<string, unknown>
): MutableSelectionRecord {
  return value.selection_configuration as MutableSelectionRecord;
}

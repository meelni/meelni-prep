import { createHash } from "node:crypto";

import { ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION } from "./interviewer-rollout";

export const ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION =
  "adaptive-interviewer-owner-preparation-request.v2" as const;
export const ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION =
  "adaptive-interviewer-owner-preparation-authorization.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION =
  "adaptive-interviewer-preview-shadow-selection.v1" as const;
export const ADAPTIVE_INTERVIEWER_SELECTED_CANDIDATE_CONFIGURATION_CONTRACT_VERSION =
  "adaptive-interviewer-selected-candidate-configuration.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION =
  "adaptive-interviewer-preview-privacy.v1" as const;

export const ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS =
  Object.freeze([
    "implement_selected_director_adapter_candidate",
    "configure_selected_director_adapter_candidate",
    "add_provider_free_candidate_validation",
  ] as const);

export const ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY = Object.freeze([
  "provider_calls",
  "provider_spend",
  "deployment",
  "live_rooms",
  "preview_influence",
  "production",
  "default_on",
  "launch_go_no_go",
] as const);

export const ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_MAX_TTL_MS =
  7 * 24 * 60 * 60 * 1_000;
export const ADAPTIVE_INTERVIEWER_PREVIEW_MAXIMUM_SESSIONS = 100;
export const ADAPTIVE_INTERVIEWER_PREVIEW_MAXIMUM_SPEND_NANO_USD = 250_000_000_000;

export interface AdaptiveInterviewerLiveMetricThresholds {
  minimum_quality_score_bps: number;
  maximum_first_audio_p50_ms: number;
  maximum_first_audio_p95_ms: number;
  minimum_completion_rate_bps: number;
  maximum_fallback_rate_bps: number;
  maximum_tool_failure_rate_bps: number;
  maximum_recommendation_age_ms: number;
  minimum_recommendation_freshness_rate_bps: number;
  minimum_interruption_recovery_rate_bps: number;
  minimum_feedback_integrity_rate_bps: number;
}

export interface AdaptiveInterviewerPreviewShadowSelection {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION;
  director: {
    adapter_id: string;
    adapter_version: string;
    provider: string;
    model: string;
  };
  preview_limits: {
    maximum_sessions: number;
    maximum_spend_nano_usd: number;
  };
  privacy_and_retention: {
    policy_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION;
    policy_accepted: true;
    data_scope: "synthetic_owner_rehearsal_only";
    customer_data_allowed: false;
    provider_training_allowed: false;
    provider_policy_reference: string;
    maximum_provider_payload_retention_days: number;
    maximum_transcript_retention_days: number;
    maximum_raw_audio_retention_days: number;
  };
  entry_thresholds: AdaptiveInterviewerLiveMetricThresholds & {
    minimum_completed_sessions: number;
  };
  stop_thresholds: AdaptiveInterviewerLiveMetricThresholds & {
    maximum_cumulative_spend_nano_usd: number;
  };
  non_tunable_hard_stops: {
    evidence_digest_drift: true;
    version_pin_mismatch: true;
    unauthorized_stage_or_cohort: true;
    deterministic_invariant_regression: true;
    any_session_or_transcript_loss: true;
    kill_switch_failure: true;
  };
}

export interface AdaptiveInterviewerPreviewShadowSelectionTemplate {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION;
  director: {
    adapter_id: null;
    adapter_version: null;
    provider: null;
    model: null;
  };
  preview_limits: {
    maximum_sessions: null;
    maximum_spend_nano_usd: null;
  };
  privacy_and_retention: {
    policy_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION;
    policy_accepted: null;
    data_scope: "synthetic_owner_rehearsal_only";
    customer_data_allowed: false;
    provider_training_allowed: false;
    provider_policy_reference: null;
    maximum_provider_payload_retention_days: null;
    maximum_transcript_retention_days: null;
    maximum_raw_audio_retention_days: null;
  };
  entry_thresholds: Record<
    | keyof AdaptiveInterviewerLiveMetricThresholds
    | "minimum_completed_sessions",
    null
  >;
  stop_thresholds: Record<
    | keyof AdaptiveInterviewerLiveMetricThresholds
    | "maximum_cumulative_spend_nano_usd",
    null
  >;
  non_tunable_hard_stops: AdaptiveInterviewerPreviewShadowSelection["non_tunable_hard_stops"];
}

export interface AdaptiveInterviewerOwnerRequest {
  contract_version: typeof ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION;
  rollout_contract_version: typeof ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION;
  current_stage: "synthetic";
  requested_work: "preview_shadow_candidate_preparation";
  future_live_stage: "preview_shadow";
  candidate_git_sha: string;
  repository_rollout_configuration_sha256: string;
  selection_configuration: null;
  selected_candidate_configuration_sha256: null;
  owner_decision: "pending";
  owner_decision_reference: null;
  owner_decided_at: null;
  authorization_expires_at: null;
  candidate_preparation_authorized: false;
  rollout_transition_authorized: false;
  system_recommendation: "hold_at_synthetic";
  selection_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION;
  selection_template: AdaptiveInterviewerPreviewShadowSelectionTemplate;
  selection_constraints: {
    closed_object: true;
    integer_units_only: true;
    spend_unit: "nano_usd_integer";
    rate_and_quality_unit: "basis_points";
    latency_unit: "milliseconds";
    maximum_sessions: { minimum: 1; maximum: 100 };
    maximum_spend_nano_usd: { minimum: 1; maximum: 250000000000 };
    retention_days: {
      provider_payload: { minimum: 0; maximum: 30 };
      transcript: { minimum: 0; maximum: 30 };
      raw_audio: { minimum: 0; maximum: 7 };
    };
    threshold_ranges: {
      basis_points: { minimum: 0; maximum: 10000 };
      first_audio_ms: { minimum: 100; maximum: 120000 };
      recommendation_age_ms: { minimum: 0; maximum: 120000 };
    };
    coherence: readonly [
      "minimum_completed_sessions_lte_maximum_sessions",
      "first_audio_p50_lte_p95",
      "stop_minima_lte_entry_minima",
      "stop_maxima_gte_entry_maxima",
      "stop_spend_lte_overall_spend_cap",
    ];
    second_live_authorization_rehearsal_matrix: "unbound_and_unperformed";
  };
  requested_authority: "prepare_isolated_preview_shadow_candidate_only";
  allowed_repository_actions: typeof ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS;
  denied_authority: typeof ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY;
}

export interface AdaptiveInterviewerPreparationAuthorization {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION;
  rollout_contract_version: typeof ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION;
  requested_authority: "prepare_isolated_preview_shadow_candidate_only";
  current_stage: "synthetic";
  future_live_stage: "preview_shadow";
  candidate_git_sha: string;
  repository_rollout_configuration_sha256: string;
  selection_configuration: AdaptiveInterviewerPreviewShadowSelection;
  selected_candidate_configuration_sha256: string;
  owner_decision: "approved";
  owner_decision_reference: string;
  owner_decided_at: string;
  authorization_expires_at: string;
  candidate_preparation_authorized: true;
  rollout_transition_authorized: false;
  allowed_repository_actions: typeof ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS;
  denied_authority: typeof ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY;
}

const AUTHORIZATION_KEYS = [
  "contract_version",
  "rollout_contract_version",
  "requested_authority",
  "current_stage",
  "future_live_stage",
  "candidate_git_sha",
  "repository_rollout_configuration_sha256",
  "selection_configuration",
  "selected_candidate_configuration_sha256",
  "owner_decision",
  "owner_decision_reference",
  "owner_decided_at",
  "authorization_expires_at",
  "candidate_preparation_authorized",
  "rollout_transition_authorized",
  "allowed_repository_actions",
  "denied_authority",
] as const;
const SELECTION_KEYS = [
  "contract_version",
  "director",
  "preview_limits",
  "privacy_and_retention",
  "entry_thresholds",
  "stop_thresholds",
  "non_tunable_hard_stops",
] as const;
const DIRECTOR_KEYS = [
  "adapter_id",
  "adapter_version",
  "provider",
  "model",
] as const;
const LIMIT_KEYS = ["maximum_sessions", "maximum_spend_nano_usd"] as const;
const PRIVACY_KEYS = [
  "policy_version",
  "policy_accepted",
  "data_scope",
  "customer_data_allowed",
  "provider_training_allowed",
  "provider_policy_reference",
  "maximum_provider_payload_retention_days",
  "maximum_transcript_retention_days",
  "maximum_raw_audio_retention_days",
] as const;
const METRIC_KEYS = [
  "minimum_quality_score_bps",
  "maximum_first_audio_p50_ms",
  "maximum_first_audio_p95_ms",
  "minimum_completion_rate_bps",
  "maximum_fallback_rate_bps",
  "maximum_tool_failure_rate_bps",
  "maximum_recommendation_age_ms",
  "minimum_recommendation_freshness_rate_bps",
  "minimum_interruption_recovery_rate_bps",
  "minimum_feedback_integrity_rate_bps",
] as const;
const HARD_STOP_KEYS = [
  "evidence_digest_drift",
  "version_pin_mismatch",
  "unauthorized_stage_or_cohort",
  "deterministic_invariant_regression",
  "any_session_or_transcript_loss",
  "kill_switch_failure",
] as const;

export function createAdaptiveInterviewerOwnerRequest(input: {
  candidateGitSha: string;
  repositoryRolloutConfigurationSha256: string;
}): AdaptiveInterviewerOwnerRequest {
  if (
    !isGitSha(input.candidateGitSha) ||
    !isSha256(input.repositoryRolloutConfigurationSha256)
  ) {
    throw new Error("adaptive_interviewer_owner_request_binding_invalid");
  }
  return {
    contract_version: ADAPTIVE_INTERVIEWER_OWNER_REQUEST_CONTRACT_VERSION,
    rollout_contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
    current_stage: "synthetic",
    requested_work: "preview_shadow_candidate_preparation",
    future_live_stage: "preview_shadow",
    candidate_git_sha: input.candidateGitSha,
    repository_rollout_configuration_sha256:
      input.repositoryRolloutConfigurationSha256,
    selection_configuration: null,
    selected_candidate_configuration_sha256: null,
    owner_decision: "pending",
    owner_decision_reference: null,
    owner_decided_at: null,
    authorization_expires_at: null,
    candidate_preparation_authorized: false,
    rollout_transition_authorized: false,
    system_recommendation: "hold_at_synthetic",
    selection_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
    selection_template: {
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
      director: {
        adapter_id: null,
        adapter_version: null,
        provider: null,
        model: null,
      },
      preview_limits: {
        maximum_sessions: null,
        maximum_spend_nano_usd: null,
      },
      privacy_and_retention: {
        policy_version: ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION,
        policy_accepted: null,
        data_scope: "synthetic_owner_rehearsal_only",
        customer_data_allowed: false,
        provider_training_allowed: false,
        provider_policy_reference: null,
        maximum_provider_payload_retention_days: null,
        maximum_transcript_retention_days: null,
        maximum_raw_audio_retention_days: null,
      },
      entry_thresholds: {
        minimum_completed_sessions: null,
        minimum_quality_score_bps: null,
        maximum_first_audio_p50_ms: null,
        maximum_first_audio_p95_ms: null,
        minimum_completion_rate_bps: null,
        maximum_fallback_rate_bps: null,
        maximum_tool_failure_rate_bps: null,
        maximum_recommendation_age_ms: null,
        minimum_recommendation_freshness_rate_bps: null,
        minimum_interruption_recovery_rate_bps: null,
        minimum_feedback_integrity_rate_bps: null,
      },
      stop_thresholds: {
        maximum_cumulative_spend_nano_usd: null,
        minimum_quality_score_bps: null,
        maximum_first_audio_p50_ms: null,
        maximum_first_audio_p95_ms: null,
        minimum_completion_rate_bps: null,
        maximum_fallback_rate_bps: null,
        maximum_tool_failure_rate_bps: null,
        maximum_recommendation_age_ms: null,
        minimum_recommendation_freshness_rate_bps: null,
        minimum_interruption_recovery_rate_bps: null,
        minimum_feedback_integrity_rate_bps: null,
      },
      non_tunable_hard_stops: {
        evidence_digest_drift: true,
        version_pin_mismatch: true,
        unauthorized_stage_or_cohort: true,
        deterministic_invariant_regression: true,
        any_session_or_transcript_loss: true,
        kill_switch_failure: true,
      },
    },
    selection_constraints: {
      closed_object: true,
      integer_units_only: true,
      spend_unit: "nano_usd_integer",
      rate_and_quality_unit: "basis_points",
      latency_unit: "milliseconds",
      maximum_sessions: { minimum: 1, maximum: 100 },
      maximum_spend_nano_usd: {
        minimum: 1,
        maximum: ADAPTIVE_INTERVIEWER_PREVIEW_MAXIMUM_SPEND_NANO_USD,
      },
      retention_days: {
        provider_payload: { minimum: 0, maximum: 30 },
        transcript: { minimum: 0, maximum: 30 },
        raw_audio: { minimum: 0, maximum: 7 },
      },
      threshold_ranges: {
        basis_points: { minimum: 0, maximum: 10_000 },
        first_audio_ms: { minimum: 100, maximum: 120_000 },
        recommendation_age_ms: { minimum: 0, maximum: 120_000 },
      },
      coherence: [
        "minimum_completed_sessions_lte_maximum_sessions",
        "first_audio_p50_lte_p95",
        "stop_minima_lte_entry_minima",
        "stop_maxima_gte_entry_maxima",
        "stop_spend_lte_overall_spend_cap",
      ],
      second_live_authorization_rehearsal_matrix: "unbound_and_unperformed",
    },
    requested_authority: "prepare_isolated_preview_shadow_candidate_only",
    allowed_repository_actions:
      ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS,
    denied_authority: ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
  };
}

export function parseAdaptiveInterviewerPreparationAuthorizationJson(
  contents: string,
  expected: {
    candidateGitSha: string;
    repositoryRolloutConfigurationSha256: string;
  },
  now: Date
): AdaptiveInterviewerPreparationAuthorization {
  let value: unknown;
  try {
    value = parseJsonRejectingDuplicateKeys(contents);
  } catch {
    throw new Error(
      "adaptive_interviewer_preparation_authorization_json_invalid"
    );
  }
  return parseAdaptiveInterviewerPreparationAuthorization(value, expected, now);
}

/**
 * Validates shape, constraints, time, and bindings only. The caller must
 * authenticate the external owner-decision reference at a trusted boundary.
 */
export function parseAdaptiveInterviewerPreparationAuthorization(
  value: unknown,
  expected: {
    candidateGitSha: string;
    repositoryRolloutConfigurationSha256: string;
  },
  now: Date
): AdaptiveInterviewerPreparationAuthorization {
  if (
    !isGitSha(expected.candidateGitSha) ||
    !isSha256(expected.repositoryRolloutConfigurationSha256)
  ) {
    bindingMismatch();
  }
  if (!Number.isFinite(now.getTime())) invalidAuthorization();

  const record = exactRecord(value, AUTHORIZATION_KEYS, invalidAuthorization);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION ||
    record.rollout_contract_version !==
      ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION ||
    record.requested_authority !==
      "prepare_isolated_preview_shadow_candidate_only" ||
    record.current_stage !== "synthetic" ||
    record.future_live_stage !== "preview_shadow" ||
    record.owner_decision !== "approved" ||
    record.candidate_preparation_authorized !== true ||
    record.rollout_transition_authorized !== false ||
    !sameArray(
      record.allowed_repository_actions,
      ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS
    ) ||
    !sameArray(
      record.denied_authority,
      ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY
    )
  ) {
    invalidAuthorization();
  }
  if (
    record.candidate_git_sha !== expected.candidateGitSha ||
    record.repository_rollout_configuration_sha256 !==
      expected.repositoryRolloutConfigurationSha256
  ) {
    bindingMismatch();
  }

  const decisionReference = record.owner_decision_reference;
  const decidedAtValue = record.owner_decided_at;
  const expiresAtValue = record.authorization_expires_at;
  if (!isDecisionReference(decisionReference)) invalidAuthorization();
  const decidedAt = wholeSecondTimestamp(decidedAtValue);
  const expiresAt = wholeSecondTimestamp(expiresAtValue);
  if (
    decidedAt.getTime() > now.getTime() ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() <= decidedAt.getTime() ||
    expiresAt.getTime() - decidedAt.getTime() >
      ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_MAX_TTL_MS
  ) {
    invalidAuthorization();
  }

  const selection = parseAdaptiveInterviewerPreviewShadowSelection(
    record.selection_configuration
  );
  const selectedConfigurationSha256 =
    adaptiveInterviewerSelectedCandidateConfigurationSha256({
      candidateGitSha: expected.candidateGitSha,
      repositoryRolloutConfigurationSha256:
        expected.repositoryRolloutConfigurationSha256,
      selectionConfiguration: selection,
    });
  if (
    record.selected_candidate_configuration_sha256 !==
    selectedConfigurationSha256
  ) {
    bindingMismatch();
  }

  return Object.freeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
    rollout_contract_version: ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION,
    requested_authority:
      "prepare_isolated_preview_shadow_candidate_only" as const,
    current_stage: "synthetic" as const,
    future_live_stage: "preview_shadow" as const,
    candidate_git_sha: expected.candidateGitSha,
    repository_rollout_configuration_sha256:
      expected.repositoryRolloutConfigurationSha256,
    selection_configuration: selection,
    selected_candidate_configuration_sha256: selectedConfigurationSha256,
    owner_decision: "approved" as const,
    owner_decision_reference: decisionReference,
    owner_decided_at: decidedAtValue as string,
    authorization_expires_at: expiresAtValue as string,
    candidate_preparation_authorized: true as const,
    rollout_transition_authorized: false as const,
    allowed_repository_actions:
      ADAPTIVE_INTERVIEWER_PREPARATION_ALLOWED_REPOSITORY_ACTIONS,
    denied_authority: ADAPTIVE_INTERVIEWER_PREPARATION_DENIED_AUTHORITY,
  });
}

export function adaptiveInterviewerSelectedCandidateConfigurationSha256(input: {
  candidateGitSha: string;
  repositoryRolloutConfigurationSha256: string;
  selectionConfiguration: unknown;
}): string {
  if (
    !isGitSha(input.candidateGitSha) ||
    !isSha256(input.repositoryRolloutConfigurationSha256)
  ) {
    throw new Error(
      "adaptive_interviewer_selected_configuration_binding_invalid"
    );
  }
  const selection = parseAdaptiveInterviewerPreviewShadowSelection(
    input.selectionConfiguration
  );
  const payload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_SELECTED_CANDIDATE_CONFIGURATION_CONTRACT_VERSION,
    requested_authority:
      "prepare_isolated_preview_shadow_candidate_only" as const,
    current_stage: "synthetic" as const,
    future_live_stage: "preview_shadow" as const,
    candidate_git_sha: input.candidateGitSha,
    repository_rollout_configuration_sha256:
      input.repositoryRolloutConfigurationSha256,
    selection_configuration: selection,
  };
  return createHash("sha256")
    .update(
      `${ADAPTIVE_INTERVIEWER_SELECTED_CANDIDATE_CONFIGURATION_CONTRACT_VERSION}\0${JSON.stringify(payload)}`
    )
    .digest("hex");
}

export function parseAdaptiveInterviewerPreviewShadowSelection(
  value: unknown
): AdaptiveInterviewerPreviewShadowSelection {
  const record = exactRecord(value, SELECTION_KEYS, invalidSelection);
  const director = exactRecord(
    record.director,
    DIRECTOR_KEYS,
    invalidSelection
  );
  const limits = exactRecord(
    record.preview_limits,
    LIMIT_KEYS,
    invalidSelection
  );
  const privacy = exactRecord(
    record.privacy_and_retention,
    PRIVACY_KEYS,
    invalidSelection
  );
  const entry = exactRecord(
    record.entry_thresholds,
    ["minimum_completed_sessions", ...METRIC_KEYS],
    invalidSelection
  );
  const stop = exactRecord(
    record.stop_thresholds,
    ["maximum_cumulative_spend_nano_usd", ...METRIC_KEYS],
    invalidSelection
  );
  const hardStops = exactRecord(
    record.non_tunable_hard_stops,
    HARD_STOP_KEYS,
    invalidSelection
  );

  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION ||
    !isIdentifier(director.adapter_id) ||
    !isToken(director.adapter_version) ||
    !isIdentifier(director.provider) ||
    !isToken(director.model) ||
    !integerBetween(
      limits.maximum_sessions,
      1,
      ADAPTIVE_INTERVIEWER_PREVIEW_MAXIMUM_SESSIONS
    ) ||
    !integerBetween(
      limits.maximum_spend_nano_usd,
      1,
      ADAPTIVE_INTERVIEWER_PREVIEW_MAXIMUM_SPEND_NANO_USD
    ) ||
    privacy.policy_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION ||
    privacy.policy_accepted !== true ||
    privacy.data_scope !== "synthetic_owner_rehearsal_only" ||
    privacy.customer_data_allowed !== false ||
    privacy.provider_training_allowed !== false ||
    !isToken(privacy.provider_policy_reference) ||
    !integerBetween(privacy.maximum_provider_payload_retention_days, 0, 30) ||
    !integerBetween(privacy.maximum_transcript_retention_days, 0, 30) ||
    !integerBetween(privacy.maximum_raw_audio_retention_days, 0, 7) ||
    !integerBetween(
      entry.minimum_completed_sessions,
      1,
      limits.maximum_sessions
    ) ||
    !validMetrics(entry) ||
    !validMetrics(stop) ||
    !integerBetween(
      stop.maximum_cumulative_spend_nano_usd,
      1,
      limits.maximum_spend_nano_usd
    ) ||
    !coherentThresholds(entry, stop) ||
    HARD_STOP_KEYS.some((key) => hardStops[key] !== true)
  ) {
    invalidSelection();
  }

  return Object.freeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTION_CONTRACT_VERSION,
    director: Object.freeze({
      adapter_id: director.adapter_id,
      adapter_version: director.adapter_version,
      provider: director.provider,
      model: director.model,
    }),
    preview_limits: Object.freeze({
      maximum_sessions: limits.maximum_sessions,
      maximum_spend_nano_usd: limits.maximum_spend_nano_usd,
    }),
    privacy_and_retention: Object.freeze({
      policy_version: ADAPTIVE_INTERVIEWER_PREVIEW_PRIVACY_POLICY_VERSION,
      policy_accepted: true as const,
      data_scope: "synthetic_owner_rehearsal_only" as const,
      customer_data_allowed: false as const,
      provider_training_allowed: false as const,
      provider_policy_reference: privacy.provider_policy_reference,
      maximum_provider_payload_retention_days:
        privacy.maximum_provider_payload_retention_days,
      maximum_transcript_retention_days:
        privacy.maximum_transcript_retention_days,
      maximum_raw_audio_retention_days:
        privacy.maximum_raw_audio_retention_days,
    }),
    entry_thresholds: Object.freeze({
      minimum_completed_sessions: entry.minimum_completed_sessions,
      ...canonicalMetrics(entry),
    }),
    stop_thresholds: Object.freeze({
      maximum_cumulative_spend_nano_usd: stop.maximum_cumulative_spend_nano_usd,
      ...canonicalMetrics(stop),
    }),
    non_tunable_hard_stops: Object.freeze({
      evidence_digest_drift: true as const,
      version_pin_mismatch: true as const,
      unauthorized_stage_or_cohort: true as const,
      deterministic_invariant_regression: true as const,
      any_session_or_transcript_loss: true as const,
      kill_switch_failure: true as const,
    }),
  });
}

type MetricRecord = Record<string, unknown> &
  AdaptiveInterviewerLiveMetricThresholds;

function validMetrics(value: Record<string, unknown>): value is MetricRecord {
  return (
    integerBetween(value.minimum_quality_score_bps, 0, 10_000) &&
    integerBetween(value.maximum_first_audio_p50_ms, 100, 120_000) &&
    integerBetween(value.maximum_first_audio_p95_ms, 100, 120_000) &&
    value.maximum_first_audio_p50_ms <= value.maximum_first_audio_p95_ms &&
    integerBetween(value.minimum_completion_rate_bps, 0, 10_000) &&
    integerBetween(value.maximum_fallback_rate_bps, 0, 10_000) &&
    integerBetween(value.maximum_tool_failure_rate_bps, 0, 10_000) &&
    integerBetween(value.maximum_recommendation_age_ms, 0, 120_000) &&
    integerBetween(
      value.minimum_recommendation_freshness_rate_bps,
      0,
      10_000
    ) &&
    integerBetween(value.minimum_interruption_recovery_rate_bps, 0, 10_000) &&
    integerBetween(value.minimum_feedback_integrity_rate_bps, 0, 10_000)
  );
}

function coherentThresholds(entry: MetricRecord, stop: MetricRecord): boolean {
  return (
    stop.minimum_quality_score_bps <= entry.minimum_quality_score_bps &&
    stop.maximum_first_audio_p50_ms >= entry.maximum_first_audio_p50_ms &&
    stop.maximum_first_audio_p95_ms >= entry.maximum_first_audio_p95_ms &&
    stop.minimum_completion_rate_bps <= entry.minimum_completion_rate_bps &&
    stop.maximum_fallback_rate_bps >= entry.maximum_fallback_rate_bps &&
    stop.maximum_tool_failure_rate_bps >= entry.maximum_tool_failure_rate_bps &&
    stop.maximum_recommendation_age_ms >= entry.maximum_recommendation_age_ms &&
    stop.minimum_recommendation_freshness_rate_bps <=
      entry.minimum_recommendation_freshness_rate_bps &&
    stop.minimum_interruption_recovery_rate_bps <=
      entry.minimum_interruption_recovery_rate_bps &&
    stop.minimum_feedback_integrity_rate_bps <=
      entry.minimum_feedback_integrity_rate_bps
  );
}

function canonicalMetrics(
  value: MetricRecord
): AdaptiveInterviewerLiveMetricThresholds {
  return {
    minimum_quality_score_bps: value.minimum_quality_score_bps,
    maximum_first_audio_p50_ms: value.maximum_first_audio_p50_ms,
    maximum_first_audio_p95_ms: value.maximum_first_audio_p95_ms,
    minimum_completion_rate_bps: value.minimum_completion_rate_bps,
    maximum_fallback_rate_bps: value.maximum_fallback_rate_bps,
    maximum_tool_failure_rate_bps: value.maximum_tool_failure_rate_bps,
    maximum_recommendation_age_ms: value.maximum_recommendation_age_ms,
    minimum_recommendation_freshness_rate_bps:
      value.minimum_recommendation_freshness_rate_bps,
    minimum_interruption_recovery_rate_bps:
      value.minimum_interruption_recovery_rate_bps,
    minimum_feedback_integrity_rate_bps:
      value.minimum_feedback_integrity_rate_bps,
  };
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  invalid: () => never
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  const record = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string")) invalid();
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid();
  }
  return record;
}

function sameArray(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  const expectedOwnKeys = [
    "length",
    ...expected.map((_, index) => String(index)),
  ];
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === expectedOwnKeys.length &&
    ownKeys.every(
      (key) => typeof key === "string" && expectedOwnKeys.includes(key)
    ) &&
    expected.every((item, index) => value[index] === item)
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z][a-z0-9_-]*$/.test(value)
  );
}

function isToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(value)
  );
}

function isDecisionReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(value)
  );
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function wholeSecondTimestamp(value: unknown): Date {
  if (typeof value !== "string") invalidAuthorization();
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed.getUTCMilliseconds() !== 0
  ) {
    invalidAuthorization();
  }
  return parsed;
}

function invalidSelection(): never {
  throw new Error("adaptive_interviewer_preview_shadow_selection_invalid");
}

function invalidAuthorization(): never {
  throw new Error("adaptive_interviewer_preparation_authorization_invalid");
}

function bindingMismatch(): never {
  throw new Error(
    "adaptive_interviewer_preparation_authorization_binding_mismatch"
  );
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function parseJsonRejectingDuplicateKeys(contents: string): unknown {
  let offset = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(contents[offset] ?? "")) offset += 1;
  };
  const value = (): unknown => {
    whitespace();
    const character = contents[offset];
    if (character === "{") return object();
    if (character === "[") return array();
    if (character === '"') return string();
    for (const [literal, parsed] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (contents.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const match = contents
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) throw new Error("json_invalid");
    offset += match[0].length;
    return Number(match[0]);
  };
  const object = (): Record<string, unknown> => {
    offset += 1;
    whitespace();
    const entries: [string, unknown][] = [];
    const keys = new Set<string>();
    if (contents[offset] === "}") {
      offset += 1;
      return {};
    }
    while (true) {
      whitespace();
      if (contents[offset] !== '"') throw new Error("json_invalid");
      const key = string();
      if (keys.has(key)) throw new Error("json_duplicate_key");
      keys.add(key);
      whitespace();
      if (contents[offset] !== ":") throw new Error("json_invalid");
      offset += 1;
      entries.push([key, value()]);
      whitespace();
      if (contents[offset] === "}") {
        offset += 1;
        return Object.fromEntries(entries);
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const array = (): unknown[] => {
    offset += 1;
    whitespace();
    const values: unknown[] = [];
    if (contents[offset] === "]") {
      offset += 1;
      return values;
    }
    while (true) {
      values.push(value());
      whitespace();
      if (contents[offset] === "]") {
        offset += 1;
        return values;
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const string = (): string => {
    const start = offset;
    offset += 1;
    while (offset < contents.length) {
      const character = contents[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(contents.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        const escape = contents[offset];
        if (escape === "u") {
          const hex = contents.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("json_invalid");
          offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error("json_invalid");
        }
        offset += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) {
        throw new Error("json_invalid");
      }
      offset += 1;
    }
    throw new Error("json_invalid");
  };

  const result = value();
  whitespace();
  if (offset !== contents.length) throw new Error("json_invalid");
  return result;
}

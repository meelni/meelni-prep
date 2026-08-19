import {
  DIRECTOR_POLICY_CONTRACT_VERSION,
  DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
  FULL_INTERVIEW_POLICY_CONTRACT_VERSION,
  FULL_INTERVIEW_PROMPT_CONTRACT_VERSION,
  INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
  INTERVIEW_ROUND_PACK_CONTRACT_VERSION,
  INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
  INTERVIEWER_MOVE_CONTRACT_VERSION,
  INTERVIEWER_TOOL_CONTRACT_VERSION,
  STATEFUL_INTERVIEWER_ROLLOUT_FLAGS,
} from "./interviewer-contract-types";
import {
  DIRECTOR_INFLUENCE_CONFIG_VERSION,
  DIRECTOR_INFLUENCE_CONTRACT_VERSION,
  DIRECTOR_INFLUENCE_POLICY_VERSION,
  INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
  INTERVIEWER_OBSERVABILITY_REPORT_VERSION,
  type InterviewerRolloutCohort,
} from "./interviewer-observability";
import { DEFAULT_INTERVIEW_RUNTIME_SETTINGS } from "./room-metadata";

export const ADAPTIVE_INTERVIEWER_ROLLOUT_CONTRACT_VERSION =
  "adaptive-interviewer-rollout.v1" as const;

export const ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES = [
  "disabled",
  "synthetic",
  "preview_shadow",
  "preview_influence",
  "production_shadow",
  "production_canary",
  "candidate_default",
] as const;

export type AdaptiveInterviewerRolloutStage =
  (typeof ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES)[number];
export type AdaptiveInterviewerRolloutFlag =
  keyof typeof STATEFUL_INTERVIEWER_ROLLOUT_FLAGS;

export const ADAPTIVE_INTERVIEWER_ENTRY_REQUIREMENTS = [
  "frozen_evidence_digests_match",
  "provider_free_verification_passes",
  "all_adaptive_flags_off",
  "director_adapter_absent",
  "prior_stage_exit_passed",
  "exact_candidate_and_configuration_pinned",
  "separate_owner_authorization",
  "director_adapter_provider_model_pinned",
  "environment_isolation_verified",
  "spend_privacy_retention_accepted",
  "numeric_entry_stop_thresholds_accepted",
  "minimum_live_sample_satisfied",
  "quality_threshold_satisfied",
  "latency_completion_thresholds_satisfied",
  "feedback_integrity_threshold_satisfied",
  "rollback_rehearsal_passed",
  "owner_launch_go_recorded",
  "production_action_authorized",
] as const;
export type AdaptiveInterviewerEntryRequirement =
  (typeof ADAPTIVE_INTERVIEWER_ENTRY_REQUIREMENTS)[number];

export const ADAPTIVE_INTERVIEWER_EXIT_REQUIREMENTS = [
  "frozen_evidence_digests_match",
  "provider_free_verification_passes",
  "selected_adapter_candidate_provider_free_validation_passes",
  "owner_accepted_minimum_sample_satisfied",
  "owner_accepted_quality_threshold_satisfied",
  "owner_accepted_latency_completion_thresholds_satisfied",
  "owner_accepted_feedback_integrity_threshold_satisfied",
  "rollback_rehearsal_passed",
  "owner_launch_go_recorded",
] as const;
export type AdaptiveInterviewerExitRequirement =
  (typeof ADAPTIVE_INTERVIEWER_EXIT_REQUIREMENTS)[number];

export const ADAPTIVE_INTERVIEWER_HARD_STOP_SIGNALS = [
  "evidence_digest_drift",
  "version_pin_mismatch",
  "unauthorized_stage_or_cohort",
  "deterministic_invariant_regression",
  "quality_threshold_regression",
  "p95_first_audio_regression",
  "completion_rate_regression",
  "fallback_rate_regression",
  "tool_failure_rate_regression",
  "director_freshness_regression",
  "interruption_recovery_regression",
  "feedback_integrity_regression",
  "session_or_transcript_loss",
  "spend_cap_exceeded",
  "kill_switch_failure",
] as const;
export type AdaptiveInterviewerHardStopSignal =
  (typeof ADAPTIVE_INTERVIEWER_HARD_STOP_SIGNALS)[number];

export interface AdaptiveInterviewerRolloutStageDefinition {
  stage: AdaptiveInterviewerRolloutStage;
  environment: "repository" | "preview" | "production";
  director_mode: "none" | "shadow" | "influence";
  exposure: "none" | "owner_only" | "bounded_candidates" | "default";
  expected_rollout_cohort: InterviewerRolloutCohort;
  required_flags: Record<AdaptiveInterviewerRolloutFlag, boolean>;
  entry_requirements: readonly AdaptiveInterviewerEntryRequirement[];
  exit_requirements: readonly AdaptiveInterviewerExitRequirement[];
  hard_stop_signals: readonly AdaptiveInterviewerHardStopSignal[];
  rollback_target: AdaptiveInterviewerRolloutStage | null;
  requires_separate_owner_authorization: boolean;
  requires_live_evidence: boolean;
}

const FLAGS_OFF = {
  brief_v2: false,
  controller_v1: false,
  tools_v1: false,
  director_shadow_v1: false,
  director_influence_v1: false,
} as const;
const SHADOW_FLAGS = {
  brief_v2: true,
  controller_v1: true,
  tools_v1: true,
  director_shadow_v1: true,
  director_influence_v1: false,
} as const;
const INFLUENCE_FLAGS = {
  brief_v2: true,
  controller_v1: true,
  tools_v1: true,
  director_shadow_v1: true,
  director_influence_v1: true,
} as const;

export const ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS: readonly AdaptiveInterviewerRolloutStageDefinition[] =
  [
    stage("disabled", "repository", "none", "none", "current", FLAGS_OFF),
    stage("synthetic", "repository", "none", "none", "current", FLAGS_OFF),
    stage(
      "preview_shadow",
      "preview",
      "shadow",
      "none",
      "shadow",
      SHADOW_FLAGS,
      true,
      true
    ),
    stage(
      "preview_influence",
      "preview",
      "influence",
      "owner_only",
      "canary",
      INFLUENCE_FLAGS,
      true,
      true
    ),
    stage(
      "production_shadow",
      "production",
      "shadow",
      "none",
      "shadow",
      SHADOW_FLAGS,
      true,
      true
    ),
    stage(
      "production_canary",
      "production",
      "influence",
      "bounded_candidates",
      "canary",
      INFLUENCE_FLAGS,
      true,
      true
    ),
    stage(
      "candidate_default",
      "production",
      "influence",
      "default",
      "canary",
      INFLUENCE_FLAGS,
      true,
      true
    ),
  ];

export interface AdaptiveInterviewerVersionPins {
  room_metadata_contract: 1;
  interview_brief_contract: typeof INTERVIEW_BRIEF_V2_CONTRACT_VERSION;
  round_pack_contract: typeof INTERVIEW_ROUND_PACK_CONTRACT_VERSION;
  full_interview_policy: typeof FULL_INTERVIEW_POLICY_CONTRACT_VERSION;
  prompt_contract: typeof FULL_INTERVIEW_PROMPT_CONTRACT_VERSION;
  runtime_state_contract: typeof INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION;
  controller_state_contract: "deterministic-interview-controller.v1";
  controller_policy: "deterministic-interview-policy.v1";
  controller_snapshot_contract: "interview-controller-snapshot.v1";
  interviewer_move_contract: typeof INTERVIEWER_MOVE_CONTRACT_VERSION;
  interviewer_tool_contract: typeof INTERVIEWER_TOOL_CONTRACT_VERSION;
  director_recommendation_contract: typeof DIRECTOR_RECOMMENDATION_CONTRACT_VERSION;
  director_policy: typeof DIRECTOR_POLICY_CONTRACT_VERSION;
  director_influence_contract: typeof DIRECTOR_INFLUENCE_CONTRACT_VERSION;
  director_influence_policy: typeof DIRECTOR_INFLUENCE_POLICY_VERSION;
  director_influence_config: typeof DIRECTOR_INFLUENCE_CONFIG_VERSION;
  observability_contract: typeof INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION;
  observability_report_contract: typeof INTERVIEWER_OBSERVABILITY_REPORT_VERSION;
  adaptive_feedback_fixture: "adaptive-feedback-regression.v1";
  stt_model: string;
  llm_model: string;
  tts_model: string;
  voice: string;
  director_adapter_version: string | null;
  director_model: string | null;
}

export function repositoryAdaptiveInterviewerVersionPins(): AdaptiveInterviewerVersionPins {
  return {
    room_metadata_contract: 1,
    interview_brief_contract: INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
    round_pack_contract: INTERVIEW_ROUND_PACK_CONTRACT_VERSION,
    full_interview_policy: FULL_INTERVIEW_POLICY_CONTRACT_VERSION,
    prompt_contract: FULL_INTERVIEW_PROMPT_CONTRACT_VERSION,
    runtime_state_contract: INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
    controller_state_contract: "deterministic-interview-controller.v1",
    controller_policy: "deterministic-interview-policy.v1",
    controller_snapshot_contract: "interview-controller-snapshot.v1",
    interviewer_move_contract: INTERVIEWER_MOVE_CONTRACT_VERSION,
    interviewer_tool_contract: INTERVIEWER_TOOL_CONTRACT_VERSION,
    director_recommendation_contract: DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    director_policy: DIRECTOR_POLICY_CONTRACT_VERSION,
    director_influence_contract: DIRECTOR_INFLUENCE_CONTRACT_VERSION,
    director_influence_policy: DIRECTOR_INFLUENCE_POLICY_VERSION,
    director_influence_config: DIRECTOR_INFLUENCE_CONFIG_VERSION,
    observability_contract: INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
    observability_report_contract: INTERVIEWER_OBSERVABILITY_REPORT_VERSION,
    adaptive_feedback_fixture: "adaptive-feedback-regression.v1",
    stt_model: DEFAULT_INTERVIEW_RUNTIME_SETTINGS.stt_model,
    llm_model: DEFAULT_INTERVIEW_RUNTIME_SETTINGS.llm_model,
    tts_model: DEFAULT_INTERVIEW_RUNTIME_SETTINGS.tts_model,
    voice: DEFAULT_INTERVIEW_RUNTIME_SETTINGS.voice,
    director_adapter_version: null,
    director_model: null,
  };
}

export function resolveAdaptiveInterviewerFlags(
  env: Readonly<Record<string, string | undefined>>
): Record<AdaptiveInterviewerRolloutFlag, boolean> {
  return Object.fromEntries(
    Object.entries(STATEFUL_INTERVIEWER_ROLLOUT_FLAGS).map(([key, name]) => [
      key,
      env[name] === "true",
    ])
  ) as Record<AdaptiveInterviewerRolloutFlag, boolean>;
}

export function resolveAdaptiveInterviewerCohort(
  flags: Readonly<Record<AdaptiveInterviewerRolloutFlag, boolean>>
): InterviewerRolloutCohort {
  if (flags.director_influence_v1) return "canary";
  if (flags.director_shadow_v1) return "shadow";
  return "current";
}

export type AdaptiveInterviewerConfigurationReason =
  | "matched"
  | "flag_mismatch"
  | "cohort_mismatch"
  | "adapter_must_be_absent"
  | "adapter_required"
  | "director_model_must_be_absent"
  | "director_model_required";

export function assessAdaptiveInterviewerStageConfiguration(input: {
  stage: AdaptiveInterviewerRolloutStage;
  env: Readonly<Record<string, string | undefined>>;
  directorAdapterVersion: string | null;
  directorModel: string | null;
}): { accepted: boolean; reason: AdaptiveInterviewerConfigurationReason } {
  const definition = definitionFor(input.stage);
  const flags = resolveAdaptiveInterviewerFlags(input.env);
  if (!sameFlags(flags, definition.required_flags)) {
    return { accepted: false, reason: "flag_mismatch" };
  }
  if (
    resolveAdaptiveInterviewerCohort(flags) !==
    definition.expected_rollout_cohort
  ) {
    return { accepted: false, reason: "cohort_mismatch" };
  }
  if (definition.director_mode === "none") {
    if (input.directorAdapterVersion !== null) {
      return { accepted: false, reason: "adapter_must_be_absent" };
    }
    if (input.directorModel !== null) {
      return { accepted: false, reason: "director_model_must_be_absent" };
    }
  } else {
    if (!isVersionToken(input.directorAdapterVersion)) {
      return { accepted: false, reason: "adapter_required" };
    }
    if (!isVersionToken(input.directorModel)) {
      return { accepted: false, reason: "director_model_required" };
    }
  }
  return { accepted: true, reason: "matched" };
}

export type AdaptiveInterviewerTransitionReason =
  | "adjacent_forward"
  | "declared_rollback"
  | "same_stage"
  | "stage_skip_denied"
  | "owner_authorization_required"
  | "owner_authorization_mismatch";

export interface AdaptiveInterviewerStageAuthorization {
  stage: Exclude<AdaptiveInterviewerRolloutStage, "disabled" | "synthetic">;
  candidate_git_sha: string;
  configuration_sha256: string;
}

export function assessAdaptiveInterviewerTransition(input: {
  from: AdaptiveInterviewerRolloutStage;
  to: AdaptiveInterviewerRolloutStage;
  candidateGitSha: string;
  configurationSha256: string;
  ownerAuthorization: AdaptiveInterviewerStageAuthorization | null;
}): { accepted: boolean; reason: AdaptiveInterviewerTransitionReason } {
  const fromIndex = ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES.indexOf(input.from);
  const toIndex = ADAPTIVE_INTERVIEWER_ROLLOUT_STAGES.indexOf(input.to);
  if (toIndex === fromIndex) return { accepted: false, reason: "same_stage" };
  if (definitionFor(input.from).rollback_target === input.to) {
    return { accepted: true, reason: "declared_rollback" };
  }
  if (toIndex !== fromIndex + 1) {
    return { accepted: false, reason: "stage_skip_denied" };
  }
  const definition = definitionFor(input.to);
  if (!definition.requires_separate_owner_authorization) {
    return { accepted: true, reason: "adjacent_forward" };
  }
  if (input.ownerAuthorization === null) {
    return { accepted: false, reason: "owner_authorization_required" };
  }
  if (
    input.ownerAuthorization.stage !== input.to ||
    input.ownerAuthorization.candidate_git_sha !== input.candidateGitSha ||
    input.ownerAuthorization.configuration_sha256 !==
      input.configurationSha256 ||
    !isGitSha(input.candidateGitSha) ||
    !isSha256(input.configurationSha256)
  ) {
    return { accepted: false, reason: "owner_authorization_mismatch" };
  }
  return { accepted: true, reason: "adjacent_forward" };
}

function stage(
  name: AdaptiveInterviewerRolloutStage,
  environment: AdaptiveInterviewerRolloutStageDefinition["environment"],
  directorMode: AdaptiveInterviewerRolloutStageDefinition["director_mode"],
  exposure: AdaptiveInterviewerRolloutStageDefinition["exposure"],
  cohort: InterviewerRolloutCohort,
  flags: Readonly<Record<AdaptiveInterviewerRolloutFlag, boolean>>,
  requiresOwnerAuthorization = false,
  requiresLiveEvidence = false
): AdaptiveInterviewerRolloutStageDefinition {
  return {
    stage: name,
    environment,
    director_mode: directorMode,
    exposure,
    expected_rollout_cohort: cohort,
    required_flags: { ...flags },
    ...stageControls(name),
    requires_separate_owner_authorization: requiresOwnerAuthorization,
    requires_live_evidence: requiresLiveEvidence,
  };
}

function stageControls(stageName: AdaptiveInterviewerRolloutStage): {
  entry_requirements: readonly AdaptiveInterviewerEntryRequirement[];
  exit_requirements: readonly AdaptiveInterviewerExitRequirement[];
  hard_stop_signals: readonly AdaptiveInterviewerHardStopSignal[];
  rollback_target: AdaptiveInterviewerRolloutStage | null;
} {
  const commonLiveEntry: readonly AdaptiveInterviewerEntryRequirement[] = [
    "prior_stage_exit_passed",
    "exact_candidate_and_configuration_pinned",
    "separate_owner_authorization",
    "director_adapter_provider_model_pinned",
    "environment_isolation_verified",
    "spend_privacy_retention_accepted",
    "numeric_entry_stop_thresholds_accepted",
  ];
  const commonLiveStops = ADAPTIVE_INTERVIEWER_HARD_STOP_SIGNALS;
  switch (stageName) {
    case "disabled":
      return {
        entry_requirements: [],
        exit_requirements: [],
        hard_stop_signals: [],
        rollback_target: null,
      };
    case "synthetic":
      return {
        entry_requirements: [
          "frozen_evidence_digests_match",
          "provider_free_verification_passes",
          "all_adaptive_flags_off",
          "director_adapter_absent",
        ],
        exit_requirements: [
          "frozen_evidence_digests_match",
          "provider_free_verification_passes",
          "selected_adapter_candidate_provider_free_validation_passes",
        ],
        hard_stop_signals: [
          "evidence_digest_drift",
          "version_pin_mismatch",
          "deterministic_invariant_regression",
          "feedback_integrity_regression",
          "kill_switch_failure",
        ],
        rollback_target: "disabled",
      };
    case "preview_shadow":
      return {
        entry_requirements: commonLiveEntry,
        exit_requirements: liveExitRequirements(),
        hard_stop_signals: commonLiveStops,
        rollback_target: "synthetic",
      };
    case "preview_influence":
      return {
        entry_requirements: [
          ...commonLiveEntry,
          "minimum_live_sample_satisfied",
          "quality_threshold_satisfied",
          "latency_completion_thresholds_satisfied",
          "feedback_integrity_threshold_satisfied",
          "rollback_rehearsal_passed",
        ],
        exit_requirements: liveExitRequirements(),
        hard_stop_signals: commonLiveStops,
        rollback_target: "preview_shadow",
      };
    case "production_shadow":
      return {
        entry_requirements: [
          ...commonLiveEntry,
          "minimum_live_sample_satisfied",
          "quality_threshold_satisfied",
          "latency_completion_thresholds_satisfied",
          "feedback_integrity_threshold_satisfied",
          "rollback_rehearsal_passed",
          "production_action_authorized",
        ],
        exit_requirements: liveExitRequirements(),
        hard_stop_signals: commonLiveStops,
        rollback_target: "disabled",
      };
    case "production_canary":
      return {
        entry_requirements: [
          ...commonLiveEntry,
          "minimum_live_sample_satisfied",
          "quality_threshold_satisfied",
          "latency_completion_thresholds_satisfied",
          "feedback_integrity_threshold_satisfied",
          "rollback_rehearsal_passed",
          "production_action_authorized",
        ],
        exit_requirements: [
          ...liveExitRequirements(),
          "owner_launch_go_recorded",
        ],
        hard_stop_signals: commonLiveStops,
        rollback_target: "production_shadow",
      };
    case "candidate_default":
      return {
        entry_requirements: [
          ...commonLiveEntry,
          "minimum_live_sample_satisfied",
          "quality_threshold_satisfied",
          "latency_completion_thresholds_satisfied",
          "feedback_integrity_threshold_satisfied",
          "rollback_rehearsal_passed",
          "owner_launch_go_recorded",
          "production_action_authorized",
        ],
        exit_requirements: [],
        hard_stop_signals: commonLiveStops,
        rollback_target: "production_canary",
      };
  }
}

function liveExitRequirements(): readonly AdaptiveInterviewerExitRequirement[] {
  return [
    "owner_accepted_minimum_sample_satisfied",
    "owner_accepted_quality_threshold_satisfied",
    "owner_accepted_latency_completion_thresholds_satisfied",
    "owner_accepted_feedback_integrity_threshold_satisfied",
    "rollback_rehearsal_passed",
  ];
}

function definitionFor(
  value: AdaptiveInterviewerRolloutStage
): AdaptiveInterviewerRolloutStageDefinition {
  const definition = ADAPTIVE_INTERVIEWER_STAGE_DEFINITIONS.find(
    (candidate) => candidate.stage === value
  );
  if (!definition) throw new Error("adaptive_interviewer_stage_invalid");
  return definition;
}

function sameFlags(
  left: Readonly<Record<AdaptiveInterviewerRolloutFlag, boolean>>,
  right: Readonly<Record<AdaptiveInterviewerRolloutFlag, boolean>>
): boolean {
  return (
    Object.keys(
      STATEFUL_INTERVIEWER_ROLLOUT_FLAGS
    ) as AdaptiveInterviewerRolloutFlag[]
  ).every((key) => left[key] === right[key]);
}

function isVersionToken(value: string | null): value is string {
  return value !== null && /^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value);
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

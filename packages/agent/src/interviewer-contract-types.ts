import type {
  DifficultyLevel,
  InterviewLifecycleState,
  RoundType,
} from "@meelni/core";

export const INTERVIEW_BRIEF_V2_CONTRACT_VERSION =
  "interview-brief.v2" as const;
export const INTERVIEW_ROUND_PACK_CONTRACT_VERSION =
  "pm-round-pack.v1" as const;
export const FULL_INTERVIEW_POLICY_CONTRACT_VERSION =
  "full-interview-policy.v1" as const;
export const INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION =
  "interview-runtime-state.v1" as const;
export const INTERVIEWER_MOVE_CONTRACT_VERSION = "interviewer-move.v1" as const;
export const INTERVIEWER_TOOL_CONTRACT_VERSION =
  "interviewer-tools.v1" as const;
export const DIRECTOR_RECOMMENDATION_CONTRACT_VERSION =
  "director-recommendation.v1" as const;

export const STATEFUL_INTERVIEWER_ROLLOUT_FLAGS = {
  brief_v2: "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
  controller_v1: "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
  tools_v1: "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
  director_shadow_v1: "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
  director_influence_v1: "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
} as const;

export const INTERVIEWER_MOVE_TYPES = [
  "probe",
  "clarify",
  "challenge",
  "transition",
  "close",
] as const;

export const INTERVIEWER_MOVE_REASON_CODES = [
  "deepen_reasoning",
  "resolve_ambiguity",
  "test_tradeoff",
  "advance_round",
  "deadline_close",
  "candidate_requested_close",
  "controller_fallback",
] as const;

export const INTERVIEWER_TOOL_NAMES = [
  "read_interview_state",
  "read_interview_clock",
  "get_probe_candidates",
  "commit_interviewer_move",
  "request_graceful_close",
] as const;

export const INTERVIEWER_TOOL_DEFINITIONS = {
  read_interview_state: {
    authority: "read_only_state",
    deadline_policy: "server_configured_absolute_deadline",
    idempotent: true,
  },
  read_interview_clock: {
    authority: "read_only_clock",
    deadline_policy: "server_configured_absolute_deadline",
    idempotent: true,
  },
  get_probe_candidates: {
    authority: "read_only_candidates",
    deadline_policy: "server_configured_absolute_deadline",
    idempotent: true,
  },
  commit_interviewer_move: {
    authority: "controller_validated_commit",
    deadline_policy: "server_configured_absolute_deadline",
    idempotent: true,
  },
  request_graceful_close: {
    authority: "controller_validated_close_request",
    deadline_policy: "server_configured_absolute_deadline",
    idempotent: true,
  },
} as const;

export type InterviewerMoveType = (typeof INTERVIEWER_MOVE_TYPES)[number];
export type InterviewerMoveReasonCode =
  (typeof INTERVIEWER_MOVE_REASON_CODES)[number];
export type InterviewerToolName = (typeof INTERVIEWER_TOOL_NAMES)[number];

export interface InterviewBriefQuestionV2 {
  id: string;
  text: string;
  company: string | null;
  type: string;
}

export interface InterviewRoundPackV1 {
  contract_version: typeof INTERVIEW_ROUND_PACK_CONTRACT_VERSION;
  round_type: RoundType;
  objectives: string[];
  probe_families: string[];
  transition_guidance: string[];
  close_guidance: string[];
  forbidden_behaviors: ["coaching", "hinting", "mid_session_evaluation"];
}

export interface FullInterviewPolicyV1 {
  contract_version: typeof FULL_INTERVIEW_POLICY_CONTRACT_VERSION;
  prompt_contract_version: string;
  interviewer_mode: "full_interview";
  coaching: "forbidden";
  hints: "forbidden";
  evaluation_timing: "post_interview_only";
  selected_question_policy: "exact_first_turn";
  one_substantive_question_per_turn: true;
}

export interface InterviewBriefV2 {
  contract_version: typeof INTERVIEW_BRIEF_V2_CONTRACT_VERSION;
  brief_id: string;
  payload_digest: string;
  session_id: string;
  session_start_fingerprint: string;
  deadline_at: string;
  round_type: RoundType;
  difficulty: DifficultyLevel;
  duration_minutes: 15 | 30 | 45;
  selected_question: InterviewBriefQuestionV2;
  company_context: {
    company_name: string;
    context_version: string;
    summary: string;
  } | null;
  candidate_practice_goal: string | null;
  round_pack: InterviewRoundPackV1;
  policy: FullInterviewPolicyV1;
}

export type InterviewBriefV2CanonicalPayload = Omit<
  InterviewBriefV2,
  "brief_id" | "payload_digest"
>;

export const INTERVIEW_PHASES = [
  "opening",
  "primary_question",
  "follow_up",
  "transition",
  "closing",
  "closed",
] as const;
export const INTERVIEW_CLOCK_BANDS = [
  "normal",
  "warning",
  "closing",
  "elapsed",
] as const;
export const INTERVIEW_CLOSE_STATES = [
  "open",
  "requested",
  "admitted",
  "speech_fenced",
] as const;
export const INTERVIEW_INTERRUPTION_STATES = [
  "clear",
  "candidate_speaking",
  "interviewer_interrupted",
  "recovery_pending",
] as const;
export const INTERVIEW_MOVE_DELIVERY_STATES = [
  "admitted",
  "generated",
  "scheduled",
  "spoken",
  "interrupted",
  "canonically_delivered",
  "aborted",
] as const;

export type InterviewPhase = (typeof INTERVIEW_PHASES)[number];
export type InterviewClockBand = (typeof INTERVIEW_CLOCK_BANDS)[number];
export type InterviewCloseState = (typeof INTERVIEW_CLOSE_STATES)[number];
export type InterviewInterruptionState =
  (typeof INTERVIEW_INTERRUPTION_STATES)[number];
export type InterviewMoveDeliveryState =
  (typeof INTERVIEW_MOVE_DELIVERY_STATES)[number];

export interface InterviewClock {
  started_at: string;
  deadline_at: string;
  observed_at: string;
  remaining_ms: number;
  band: InterviewClockBand;
}

export interface InterviewProbeLedgerEntry {
  move_id: string;
  move_type: InterviewerMoveType;
  delivery_state: InterviewMoveDeliveryState;
  question_id: string;
  target_turn_ids: string[];
  updated_at: string;
  delivery_evidence: {
    event_id: string;
    writer_id: string;
    writer_generation: number;
    sequence: number;
    delivery_state: "delivered" | "partially_delivered";
  } | null;
}

export interface InterviewRuntimeState {
  contract_version: typeof INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION;
  session_id: string;
  brief_id: string;
  state_revision: number;
  lifecycle_snapshot: {
    state: InterviewLifecycleState;
    version: number;
  };
  active_writer: {
    writer_id: string;
    writer_generation: number;
  };
  controller_phase: InterviewPhase;
  round_objective_id: string;
  current_topic: string;
  active_question_id: string;
  clock: InterviewClock;
  allowed_moves: InterviewerMoveType[];
  probe_ledger: InterviewProbeLedgerEntry[];
  last_finalized_candidate_turn_id: string | null;
  interruption_state: InterviewInterruptionState;
  close_state: InterviewCloseState;
  speech_fenced: boolean;
}

export interface InterviewerMoveTarget {
  question_id: string;
  topic: string;
  source_turn_id: string | null;
  probe_candidate_id: string | null;
}

export interface InterviewerMove {
  contract_version: typeof INTERVIEWER_MOVE_CONTRACT_VERSION;
  move_id: string;
  session_id: string;
  brief_id: string;
  writer_id: string;
  writer_generation: number;
  based_on_state_revision: number;
  move_type: InterviewerMoveType;
  target: InterviewerMoveTarget;
  reason_code: InterviewerMoveReasonCode;
  created_at: string;
  expires_at: string;
  idempotency_key: string;
}

export interface InterviewProbeCandidate {
  probe_candidate_id: string;
  move_type: Extract<InterviewerMoveType, "probe" | "clarify" | "challenge">;
  question_id: string;
  topic: string;
  reason_code: InterviewerMoveReasonCode;
}

interface InterviewerToolRequestBase {
  contract_version: typeof INTERVIEWER_TOOL_CONTRACT_VERSION;
  tool_name: InterviewerToolName;
  call_id: string;
  session_id: string;
  writer_id: string;
  writer_generation: number;
  deadline_at: string;
}

export interface ReadInterviewStateRequest extends InterviewerToolRequestBase {
  tool_name: "read_interview_state";
}

export interface ReadInterviewClockRequest extends InterviewerToolRequestBase {
  tool_name: "read_interview_clock";
}

export interface GetProbeCandidatesRequest extends InterviewerToolRequestBase {
  tool_name: "get_probe_candidates";
  expected_state_revision: number;
}

export interface CommitInterviewerMoveRequest
  extends InterviewerToolRequestBase {
  tool_name: "commit_interviewer_move";
  expected_state_revision: number;
  idempotency_key: string;
  move: InterviewerMove;
}

export interface RequestGracefulCloseRequest
  extends InterviewerToolRequestBase {
  tool_name: "request_graceful_close";
  expected_state_revision: number;
  idempotency_key: string;
  reason: "deadline" | "candidate_request" | "controller_policy";
}

export type InterviewerToolRequest =
  | ReadInterviewStateRequest
  | ReadInterviewClockRequest
  | GetProbeCandidatesRequest
  | CommitInterviewerMoveRequest
  | RequestGracefulCloseRequest;

export const INTERVIEWER_TOOL_RESULT_STATUSES = [
  "ok",
  "duplicate",
  "stale_state",
  "stale_writer",
  "expired",
  "idempotency_conflict",
  "closed",
  "invalid_request",
  "timeout",
  "unavailable",
] as const;

export type InterviewerToolResultStatus =
  (typeof INTERVIEWER_TOOL_RESULT_STATUSES)[number];

export type InterviewerToolResultPayload =
  | { state: InterviewRuntimeState }
  | { clock: InterviewClock }
  | { probe_candidates: InterviewProbeCandidate[] }
  | { committed_move: InterviewerMove }
  | { close_state: InterviewCloseState };

export interface InterviewerToolResult {
  contract_version: typeof INTERVIEWER_TOOL_CONTRACT_VERSION;
  tool_name: InterviewerToolName;
  call_id: string;
  session_id: string;
  writer_id: string;
  writer_generation: number;
  status: InterviewerToolResultStatus;
  observed_state_revision: number;
  payload: InterviewerToolResultPayload | null;
  failure_code: Exclude<InterviewerToolResultStatus, "ok" | "duplicate"> | null;
  latency_ms: number;
}

export interface DirectorRecommendation {
  contract_version: typeof DIRECTOR_RECOMMENDATION_CONTRACT_VERSION;
  recommendation_id: string;
  session_id: string;
  brief_id: string;
  writer_id: string;
  writer_generation: number;
  based_on_state_revision: number;
  source_turn_id: string;
  source_transcript_revision: string;
  source_finality: "speculative" | "finalized";
  move_type: InterviewerMoveType;
  target: InterviewerMoveTarget;
  reason_code: InterviewerMoveReasonCode;
  created_at: string;
  expires_at: string;
}

export const DIRECTOR_RECOMMENDATION_MAX_TTL_MS = 10_000;
export const INTERVIEWER_MOVE_MAX_TTL_MS = 30_000;

export const DIRECTOR_RECOMMENDATION_ELIGIBILITY = [
  "eligible",
  "session_mismatch",
  "brief_mismatch",
  "stale_state",
  "source_not_final",
  "source_turn_mismatch",
  "not_yet_valid",
  "expired",
  "move_not_allowed",
  "lifecycle_not_active",
  "speech_fenced",
] as const;

export type DirectorRecommendationEligibility =
  (typeof DIRECTOR_RECOMMENDATION_ELIGIBILITY)[number];

export class InterviewerContractError extends Error {
  constructor(
    public readonly contract:
      | "interview_brief_v2"
      | "interview_runtime_state"
      | "interviewer_move"
      | "interviewer_tool_request"
      | "interviewer_tool_result"
      | "director_recommendation",
    public readonly code:
      | "invalid_json"
      | "unsupported_contract"
      | "invalid_payload"
  ) {
    super(`Invalid ${contract}: ${code}`);
    this.name = "InterviewerContractError";
  }
}

export type InterviewBriefV2Resolution =
  | { mode: "brief_v2"; brief: InterviewBriefV2 }
  | {
      mode: "room_metadata_v1";
      reason: "absent" | "unsupported_contract" | "invalid_payload";
    };

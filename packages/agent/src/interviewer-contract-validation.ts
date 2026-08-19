import type { DifficultyLevel, RoundType } from "@meelni/core";

import {
  calculateInterviewBriefV2PayloadDigest,
  hasOnlyUnicodeScalarStrings,
} from "./interview-brief-canonicalization";
import {
  hasExactKeys,
  hasNonIntegerJsonNumberToken,
  includes,
  isBoundedArray,
  isBoundedString,
  isBoundedUniqueArray,
  isCanonicalUtcTimestamp,
  isContractToken,
  isGuidance,
  isIdentifier,
  isNonNegativeFiniteNumber,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
  isSha256Digest,
  isShortToken,
} from "./interviewer-contract-validation-primitives";
import { calculateInterviewerMutationRequestDigest } from "./interviewer-request-canonicalization";
import {
  DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
  DIRECTOR_RECOMMENDATION_MAX_TTL_MS,
  FULL_INTERVIEW_POLICY_CONTRACT_VERSION,
  INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
  INTERVIEW_CLOCK_BANDS,
  INTERVIEW_CLOSE_STATES,
  INTERVIEW_INTERRUPTION_STATES,
  INTERVIEW_MOVE_DELIVERY_STATES,
  INTERVIEW_PHASES,
  INTERVIEW_ROUND_PACK_CONTRACT_VERSION,
  INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
  INTERVIEWER_MOVE_CONTRACT_VERSION,
  INTERVIEWER_MOVE_MAX_TTL_MS,
  INTERVIEWER_MOVE_REASON_CODES,
  INTERVIEWER_MOVE_TYPES,
  INTERVIEWER_TOOL_CONTRACT_VERSION,
  INTERVIEWER_TOOL_NAMES,
  INTERVIEWER_TOOL_RESULT_STATUSES,
  InterviewerContractError,
  type DirectorRecommendation,
  type FullInterviewPolicyV1,
  type InterviewBriefQuestionV2,
  type InterviewBriefV2,
  type InterviewBriefV2Resolution,
  type InterviewClock,
  type InterviewProbeCandidate,
  type InterviewProbeLedgerEntry,
  type InterviewRoundPackV1,
  type InterviewRuntimeState,
  type InterviewerMove,
  type InterviewerMoveReasonCode,
  type InterviewerMoveTarget,
  type InterviewerMoveType,
  type InterviewerToolName,
  type InterviewerToolRequest,
  type InterviewerToolResult,
  type InterviewerToolResultPayload,
} from "./interviewer-contract-types";

export { hasNonIntegerJsonNumberToken } from "./interviewer-contract-validation-primitives";

export function resolveOptionalInterviewBriefV2(
  raw: unknown
): InterviewBriefV2Resolution {
  if (raw === undefined || raw === null) {
    return { mode: "room_metadata_v1", reason: "absent" };
  }
  try {
    return { mode: "brief_v2", brief: parseInterviewBriefV2(raw) };
  } catch (error) {
    if (
      error instanceof InterviewerContractError &&
      error.code === "unsupported_contract"
    ) {
      return { mode: "room_metadata_v1", reason: "unsupported_contract" };
    }
    return { mode: "room_metadata_v1", reason: "invalid_payload" };
  }
}

export function parseInterviewBriefV2(raw: unknown): InterviewBriefV2 {
  return parseContract(
    raw,
    "interview_brief_v2",
    INTERVIEW_BRIEF_V2_CONTRACT_VERSION,
    isInterviewBriefV2
  );
}

export function parseInterviewRuntimeState(
  raw: unknown
): InterviewRuntimeState {
  return parseContract(
    raw,
    "interview_runtime_state",
    INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION,
    isInterviewRuntimeState
  );
}

export function parseInterviewerMove(raw: unknown): InterviewerMove {
  return parseContract(
    raw,
    "interviewer_move",
    INTERVIEWER_MOVE_CONTRACT_VERSION,
    isInterviewerMove
  );
}

export function parseInterviewerToolRequest(
  raw: unknown
): InterviewerToolRequest {
  return parseContract(
    raw,
    "interviewer_tool_request",
    INTERVIEWER_TOOL_CONTRACT_VERSION,
    isInterviewerToolRequest
  );
}

export function parseInterviewerToolResult(
  raw: unknown
): InterviewerToolResult {
  return parseContract(
    raw,
    "interviewer_tool_result",
    INTERVIEWER_TOOL_CONTRACT_VERSION,
    isInterviewerToolResult
  );
}

export function parseDirectorRecommendation(
  raw: unknown
): DirectorRecommendation {
  return parseContract(
    raw,
    "director_recommendation",
    DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    isDirectorRecommendation
  );
}

export function isInterviewBriefV2(value: unknown): value is InterviewBriefV2 {
  if (
    !hasExactKeys(value, [
      "contract_version",
      "brief_id",
      "payload_digest",
      "session_id",
      "session_start_fingerprint",
      "deadline_at",
      "round_type",
      "difficulty",
      "duration_minutes",
      "selected_question",
      "company_context",
      "candidate_practice_goal",
      "round_pack",
      "policy",
    ])
  ) {
    return false;
  }

  const structurallyValid =
    hasOnlyUnicodeScalarStrings(value) &&
    value.contract_version === INTERVIEW_BRIEF_V2_CONTRACT_VERSION &&
    isSha256Digest(value.payload_digest) &&
    value.brief_id ===
      `brief:${value.payload_digest.slice("sha256:".length)}` &&
    isIdentifier(value.session_id) &&
    isSha256Digest(value.session_start_fingerprint) &&
    isCanonicalUtcTimestamp(value.deadline_at) &&
    isRoundType(value.round_type) &&
    isDifficulty(value.difficulty) &&
    isDuration(value.duration_minutes) &&
    isInterviewBriefQuestion(value.selected_question) &&
    isCompanyContext(value.company_context) &&
    (value.company_context === null ||
      value.selected_question.company === value.company_context.company_name) &&
    (value.candidate_practice_goal === null ||
      isBoundedString(value.candidate_practice_goal, 1, 500)) &&
    isInterviewRoundPack(value.round_pack) &&
    value.round_pack.round_type === value.round_type &&
    isFullInterviewPolicy(value.policy);
  if (!structurallyValid) return false;

  return (
    value.payload_digest ===
    calculateInterviewBriefV2PayloadDigest(value as unknown as InterviewBriefV2)
  );
}

export function isInterviewRuntimeState(
  value: unknown
): value is InterviewRuntimeState {
  if (
    !hasExactKeys(value, [
      "contract_version",
      "session_id",
      "brief_id",
      "state_revision",
      "lifecycle_snapshot",
      "active_writer",
      "controller_phase",
      "round_objective_id",
      "current_topic",
      "active_question_id",
      "clock",
      "allowed_moves",
      "probe_ledger",
      "last_finalized_candidate_turn_id",
      "last_finalized_candidate_transcript_revision",
      "interruption_state",
      "close_state",
      "speech_fenced",
    ])
  ) {
    return false;
  }

  if (
    value.contract_version !== INTERVIEW_RUNTIME_STATE_CONTRACT_VERSION ||
    !isIdentifier(value.session_id) ||
    !isIdentifier(value.brief_id) ||
    !isNonNegativeInteger(value.state_revision) ||
    !isLifecycleSnapshot(value.lifecycle_snapshot) ||
    !isActiveWriter(value.active_writer) ||
    !includes(INTERVIEW_PHASES, value.controller_phase) ||
    !isIdentifier(value.round_objective_id) ||
    !isBoundedString(value.current_topic, 1, 240) ||
    !isIdentifier(value.active_question_id) ||
    !isInterviewClock(value.clock) ||
    !isBoundedUniqueArray(value.allowed_moves, 0, 5, isInterviewerMoveType) ||
    !isBoundedArray(value.probe_ledger, 0, 100, isInterviewProbeLedgerEntry) ||
    new Set(value.probe_ledger.map((entry) => entry.move_id)).size !==
      value.probe_ledger.length ||
    (value.last_finalized_candidate_turn_id !== null &&
      !isIdentifier(value.last_finalized_candidate_turn_id)) ||
    (value.last_finalized_candidate_transcript_revision !== null &&
      !isIdentifier(value.last_finalized_candidate_transcript_revision)) ||
    (value.last_finalized_candidate_turn_id === null) !==
      (value.last_finalized_candidate_transcript_revision === null) ||
    (value.clock.band === "elapsed" && value.close_state === "open") ||
    (value.controller_phase === "closing" &&
      value.close_state !== "requested" &&
      value.close_state !== "admitted") ||
    (value.close_state === "admitted" &&
      value.controller_phase !== "closing") ||
    !includes(INTERVIEW_INTERRUPTION_STATES, value.interruption_state) ||
    !includes(INTERVIEW_CLOSE_STATES, value.close_state) ||
    typeof value.speech_fenced !== "boolean"
  ) {
    return false;
  }

  return value.speech_fenced
    ? value.controller_phase === "closed" &&
        value.close_state === "speech_fenced" &&
        value.allowed_moves.length === 0
    : value.controller_phase !== "closed" &&
        value.close_state !== "speech_fenced";
}

export function isInterviewerMove(value: unknown): value is InterviewerMove {
  if (
    !hasExactKeys(value, [
      "contract_version",
      "move_id",
      "session_id",
      "brief_id",
      "writer_id",
      "writer_generation",
      "based_on_state_revision",
      "based_on_lifecycle_version",
      "move_type",
      "target",
      "reason_code",
      "created_at",
      "expires_at",
      "idempotency_key",
    ])
  ) {
    return false;
  }

  return (
    value.contract_version === INTERVIEWER_MOVE_CONTRACT_VERSION &&
    isIdentifier(value.move_id) &&
    isIdentifier(value.session_id) &&
    isIdentifier(value.brief_id) &&
    isIdentifier(value.writer_id) &&
    isPositiveInteger(value.writer_generation) &&
    isNonNegativeInteger(value.based_on_state_revision) &&
    isPositiveInteger(value.based_on_lifecycle_version) &&
    isInterviewerMoveType(value.move_type) &&
    isInterviewerMoveTarget(value.target) &&
    includes(INTERVIEWER_MOVE_REASON_CODES, value.reason_code) &&
    isMoveReasonAllowed(value.move_type, value.reason_code) &&
    hasRequiredSourceTurn(value.move_type, value.target.source_turn_id) &&
    isCanonicalUtcTimestamp(value.created_at) &&
    isCanonicalUtcTimestamp(value.expires_at) &&
    hasBoundedPositiveTtl(
      value.created_at,
      value.expires_at,
      INTERVIEWER_MOVE_MAX_TTL_MS
    ) &&
    isIdentifier(value.idempotency_key)
  );
}

export function isInterviewerToolRequest(
  value: unknown
): value is InterviewerToolRequest {
  if (!isRecord(value)) return false;
  if (
    value.contract_version !== INTERVIEWER_TOOL_CONTRACT_VERSION ||
    !includes(INTERVIEWER_TOOL_NAMES, value.tool_name) ||
    !isIdentifier(value.call_id) ||
    !isIdentifier(value.session_id) ||
    !isIdentifier(value.writer_id) ||
    !isPositiveInteger(value.writer_generation) ||
    !isCanonicalUtcTimestamp(value.deadline_at)
  ) {
    return false;
  }

  switch (value.tool_name) {
    case "read_interview_state":
    case "read_interview_clock":
      return hasExactKeys(value, [
        "contract_version",
        "tool_name",
        "call_id",
        "session_id",
        "writer_id",
        "writer_generation",
        "deadline_at",
      ]);
    case "get_probe_candidates":
      return (
        hasExactKeys(value, [
          "contract_version",
          "tool_name",
          "call_id",
          "session_id",
          "writer_id",
          "writer_generation",
          "deadline_at",
          "expected_state_revision",
          "expected_lifecycle_version",
          "active_question_id",
        ]) &&
        isNonNegativeInteger(value.expected_state_revision) &&
        isPositiveInteger(value.expected_lifecycle_version) &&
        isIdentifier(value.active_question_id)
      );
    case "commit_interviewer_move":
      return (
        hasExactKeys(value, [
          "contract_version",
          "tool_name",
          "call_id",
          "session_id",
          "writer_id",
          "writer_generation",
          "deadline_at",
          "expected_state_revision",
          "expected_lifecycle_version",
          "idempotency_key",
          "request_digest",
          "move",
        ]) &&
        isNonNegativeInteger(value.expected_state_revision) &&
        isPositiveInteger(value.expected_lifecycle_version) &&
        isIdentifier(value.idempotency_key) &&
        isSha256Digest(value.request_digest) &&
        isInterviewerMove(value.move) &&
        value.move.session_id === value.session_id &&
        value.move.writer_id === value.writer_id &&
        value.move.writer_generation === value.writer_generation &&
        value.move.based_on_state_revision === value.expected_state_revision &&
        value.move.based_on_lifecycle_version ===
          value.expected_lifecycle_version &&
        value.move.idempotency_key === value.idempotency_key &&
        value.request_digest ===
          calculateInterviewerMutationRequestDigest(
            value as unknown as Extract<
              InterviewerToolRequest,
              { tool_name: "commit_interviewer_move" }
            >
          )
      );
    case "request_graceful_close":
      return (
        hasExactKeys(value, [
          "contract_version",
          "tool_name",
          "call_id",
          "session_id",
          "writer_id",
          "writer_generation",
          "deadline_at",
          "expected_state_revision",
          "expected_lifecycle_version",
          "idempotency_key",
          "request_digest",
          "reason",
        ]) &&
        isNonNegativeInteger(value.expected_state_revision) &&
        isPositiveInteger(value.expected_lifecycle_version) &&
        isIdentifier(value.idempotency_key) &&
        isSha256Digest(value.request_digest) &&
        includes(
          ["deadline", "candidate_request", "controller_policy"] as const,
          value.reason
        ) &&
        value.request_digest ===
          calculateInterviewerMutationRequestDigest(
            value as unknown as Extract<
              InterviewerToolRequest,
              { tool_name: "request_graceful_close" }
            >
          )
      );
  }
}

export function isInterviewerToolResult(
  value: unknown
): value is InterviewerToolResult {
  if (
    !hasExactKeys(value, [
      "contract_version",
      "tool_name",
      "call_id",
      "session_id",
      "writer_id",
      "writer_generation",
      "status",
      "observed_state_revision",
      "observed_lifecycle_version",
      "payload",
      "failure_code",
      "latency_ms",
    ])
  ) {
    return false;
  }
  if (
    value.contract_version !== INTERVIEWER_TOOL_CONTRACT_VERSION ||
    !includes(INTERVIEWER_TOOL_NAMES, value.tool_name) ||
    !isIdentifier(value.call_id) ||
    !isIdentifier(value.session_id) ||
    !isIdentifier(value.writer_id) ||
    !isPositiveInteger(value.writer_generation) ||
    !includes(INTERVIEWER_TOOL_RESULT_STATUSES, value.status) ||
    !isNonNegativeInteger(value.observed_state_revision) ||
    !isPositiveInteger(value.observed_lifecycle_version) ||
    !isNonNegativeFiniteNumber(value.latency_ms)
  ) {
    return false;
  }

  if (value.status === "ok" || value.status === "duplicate") {
    return (
      value.failure_code === null &&
      isToolPayload(value.tool_name, value.payload, {
        sessionId: value.session_id,
        writerId: value.writer_id,
        writerGeneration: value.writer_generation,
        observedStateRevision: value.observed_state_revision,
        observedLifecycleVersion: value.observed_lifecycle_version,
      })
    );
  }

  return value.payload === null && value.failure_code === value.status;
}

export function isDirectorRecommendation(
  value: unknown
): value is DirectorRecommendation {
  if (
    !hasExactKeys(value, [
      "contract_version",
      "recommendation_id",
      "session_id",
      "brief_id",
      "writer_id",
      "writer_generation",
      "based_on_state_revision",
      "based_on_lifecycle_version",
      "source_turn_id",
      "source_transcript_revision",
      "source_finality",
      "move_type",
      "target",
      "reason_code",
      "created_at",
      "expires_at",
    ])
  ) {
    return false;
  }

  return (
    value.contract_version === DIRECTOR_RECOMMENDATION_CONTRACT_VERSION &&
    isIdentifier(value.recommendation_id) &&
    isIdentifier(value.session_id) &&
    isIdentifier(value.brief_id) &&
    isIdentifier(value.writer_id) &&
    isPositiveInteger(value.writer_generation) &&
    isNonNegativeInteger(value.based_on_state_revision) &&
    isPositiveInteger(value.based_on_lifecycle_version) &&
    isIdentifier(value.source_turn_id) &&
    isIdentifier(value.source_transcript_revision) &&
    includes(["speculative", "finalized"] as const, value.source_finality) &&
    isInterviewerMoveType(value.move_type) &&
    isInterviewerMoveTarget(value.target) &&
    value.target.source_turn_id === value.source_turn_id &&
    includes(INTERVIEWER_MOVE_REASON_CODES, value.reason_code) &&
    isMoveReasonAllowed(value.move_type, value.reason_code) &&
    isCanonicalUtcTimestamp(value.created_at) &&
    isCanonicalUtcTimestamp(value.expires_at) &&
    hasBoundedPositiveTtl(
      value.created_at,
      value.expires_at,
      DIRECTOR_RECOMMENDATION_MAX_TTL_MS
    )
  );
}

function parseContract<T>(
  raw: unknown,
  contract: InterviewerContractError["contract"],
  expectedVersion: string,
  guard: (value: unknown) => value is T
): T {
  let value = raw;
  if (typeof raw === "string") {
    if (
      contract === "interview_brief_v2" &&
      hasNonIntegerJsonNumberToken(raw)
    ) {
      throw new InterviewerContractError(contract, "invalid_payload");
    }
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InterviewerContractError(contract, "invalid_json");
    }
  }

  if (
    isRecord(value) &&
    "contract_version" in value &&
    value.contract_version !== expectedVersion
  ) {
    throw new InterviewerContractError(contract, "unsupported_contract");
  }
  if (!guard(value)) {
    throw new InterviewerContractError(contract, "invalid_payload");
  }
  return value;
}

function isInterviewBriefQuestion(
  value: unknown
): value is InterviewBriefQuestionV2 {
  return (
    hasExactKeys(value, ["id", "text", "company", "type"]) &&
    isIdentifier(value.id) &&
    isBoundedString(value.text, 1, 1_500) &&
    (value.company === null || isBoundedString(value.company, 1, 120)) &&
    isBoundedString(value.type, 1, 120)
  );
}

function isCompanyContext(
  value: unknown
): value is InterviewBriefV2["company_context"] {
  return (
    value === null ||
    (hasExactKeys(value, ["company_name", "context_version", "summary"]) &&
      isBoundedString(value.company_name, 1, 120) &&
      isContractToken(value.context_version) &&
      isBoundedString(value.summary, 1, 1_000))
  );
}

function isInterviewRoundPack(value: unknown): value is InterviewRoundPackV1 {
  return (
    hasExactKeys(value, [
      "contract_version",
      "round_type",
      "objectives",
      "probe_families",
      "transition_guidance",
      "close_guidance",
      "forbidden_behaviors",
    ]) &&
    value.contract_version === INTERVIEW_ROUND_PACK_CONTRACT_VERSION &&
    isRoundType(value.round_type) &&
    isBoundedUniqueArray(value.objectives, 1, 8, isShortToken) &&
    isBoundedUniqueArray(value.probe_families, 1, 12, isShortToken) &&
    isBoundedArray(value.transition_guidance, 1, 8, isGuidance) &&
    isBoundedArray(value.close_guidance, 1, 8, isGuidance) &&
    Array.isArray(value.forbidden_behaviors) &&
    value.forbidden_behaviors.length === 3 &&
    value.forbidden_behaviors[0] === "coaching" &&
    value.forbidden_behaviors[1] === "hinting" &&
    value.forbidden_behaviors[2] === "mid_session_evaluation"
  );
}

function isFullInterviewPolicy(value: unknown): value is FullInterviewPolicyV1 {
  return (
    hasExactKeys(value, [
      "contract_version",
      "prompt_contract_version",
      "interviewer_mode",
      "coaching",
      "hints",
      "evaluation_timing",
      "selected_question_policy",
      "one_substantive_question_per_turn",
    ]) &&
    value.contract_version === FULL_INTERVIEW_POLICY_CONTRACT_VERSION &&
    isContractToken(value.prompt_contract_version) &&
    value.interviewer_mode === "full_interview" &&
    value.coaching === "forbidden" &&
    value.hints === "forbidden" &&
    value.evaluation_timing === "post_interview_only" &&
    value.selected_question_policy === "exact_first_turn" &&
    value.one_substantive_question_per_turn === true
  );
}

function isInterviewClock(value: unknown): value is InterviewClock {
  if (
    !hasExactKeys(value, [
      "started_at",
      "deadline_at",
      "observed_at",
      "remaining_ms",
      "band",
    ]) ||
    !isCanonicalUtcTimestamp(value.started_at) ||
    !isCanonicalUtcTimestamp(value.deadline_at) ||
    !isCanonicalUtcTimestamp(value.observed_at) ||
    !isNonNegativeInteger(value.remaining_ms) ||
    !includes(INTERVIEW_CLOCK_BANDS, value.band)
  ) {
    return false;
  }
  const startedAt = Date.parse(value.started_at);
  const deadlineAt = Date.parse(value.deadline_at);
  const observedAt = Date.parse(value.observed_at);
  const projectedRemainingMs = Math.max(0, deadlineAt - observedAt);
  return (
    deadlineAt > startedAt &&
    observedAt >= startedAt &&
    value.remaining_ms === projectedRemainingMs &&
    (value.band === "elapsed") === (projectedRemainingMs === 0)
  );
}

function isLifecycleSnapshot(
  value: unknown
): value is InterviewRuntimeState["lifecycle_snapshot"] {
  return (
    hasExactKeys(value, ["state", "version"]) &&
    includes(
      [
        "created",
        "connecting",
        "active",
        "reconnecting",
        "ending",
        "completed",
        "abandoned",
        "failed",
      ] as const,
      value.state
    ) &&
    isPositiveInteger(value.version)
  );
}

function isActiveWriter(
  value: unknown
): value is InterviewRuntimeState["active_writer"] {
  return (
    hasExactKeys(value, ["writer_id", "writer_generation"]) &&
    isIdentifier(value.writer_id) &&
    isPositiveInteger(value.writer_generation)
  );
}

function isInterviewProbeLedgerEntry(
  value: unknown
): value is InterviewProbeLedgerEntry {
  return (
    hasExactKeys(value, [
      "move_id",
      "move_type",
      "delivery_state",
      "question_id",
      "target_turn_ids",
      "updated_at",
      "delivery_evidence",
    ]) &&
    isIdentifier(value.move_id) &&
    isInterviewerMoveType(value.move_type) &&
    includes(INTERVIEW_MOVE_DELIVERY_STATES, value.delivery_state) &&
    isIdentifier(value.question_id) &&
    isBoundedUniqueArray(value.target_turn_ids, 0, 8, isIdentifier) &&
    isCanonicalUtcTimestamp(value.updated_at) &&
    isDeliveryEvidence(value.delivery_state, value.delivery_evidence)
  );
}

function isDeliveryEvidence(
  deliveryState: unknown,
  value: unknown
): value is InterviewProbeLedgerEntry["delivery_evidence"] {
  if (value === null) {
    return (
      deliveryState !== "canonically_delivered" &&
      deliveryState !== "interrupted"
    );
  }
  if (!isRecord(value)) return false;
  if (value.evidence_type === "transcript_event") {
    return (
      (deliveryState === "canonically_delivered" ||
        deliveryState === "interrupted") &&
      hasExactKeys(value, [
        "evidence_type",
        "event_id",
        "writer_id",
        "writer_generation",
        "sequence",
        "delivery_state",
      ]) &&
      isIdentifier(value.event_id) &&
      isIdentifier(value.writer_id) &&
      isPositiveInteger(value.writer_generation) &&
      isPositiveInteger(value.sequence) &&
      includes(
        ["delivered", "partially_delivered"] as const,
        value.delivery_state
      ) &&
      (deliveryState !== "interrupted" ||
        value.delivery_state === "partially_delivered")
    );
  }
  return (
    deliveryState === "interrupted" &&
    hasExactKeys(value, [
      "evidence_type",
      "event_id",
      "writer_id",
      "writer_generation",
      "sequence",
      "reason",
    ]) &&
    value.evidence_type === "interruption_marker" &&
    isIdentifier(value.event_id) &&
    isIdentifier(value.writer_id) &&
    isPositiveInteger(value.writer_generation) &&
    isPositiveInteger(value.sequence) &&
    value.reason === "no_provider_confirmed_prefix"
  );
}

function isInterviewerMoveTarget(
  value: unknown
): value is InterviewerMoveTarget {
  return (
    hasExactKeys(value, [
      "question_id",
      "topic",
      "source_turn_id",
      "probe_candidate_id",
    ]) &&
    isIdentifier(value.question_id) &&
    isBoundedString(value.topic, 1, 240) &&
    (value.source_turn_id === null || isIdentifier(value.source_turn_id)) &&
    (value.probe_candidate_id === null ||
      isIdentifier(value.probe_candidate_id))
  );
}

function isProbeCandidate(value: unknown): value is InterviewProbeCandidate {
  return (
    hasExactKeys(value, [
      "probe_candidate_id",
      "move_type",
      "question_id",
      "topic",
      "reason_code",
    ]) &&
    isIdentifier(value.probe_candidate_id) &&
    includes(["probe", "clarify", "challenge"] as const, value.move_type) &&
    isIdentifier(value.question_id) &&
    isBoundedString(value.topic, 1, 240) &&
    includes(INTERVIEWER_MOVE_REASON_CODES, value.reason_code) &&
    isMoveReasonAllowed(value.move_type, value.reason_code)
  );
}

function isToolPayload(
  toolName: InterviewerToolName,
  value: unknown,
  envelope: {
    sessionId: string;
    writerId: string;
    writerGeneration: number;
    observedStateRevision: number;
    observedLifecycleVersion: number;
  }
): value is InterviewerToolResultPayload {
  switch (toolName) {
    case "read_interview_state":
      return (
        hasExactKeys(value, ["state"]) &&
        isInterviewRuntimeState(value.state) &&
        value.state.session_id === envelope.sessionId &&
        value.state.active_writer.writer_id === envelope.writerId &&
        value.state.active_writer.writer_generation ===
          envelope.writerGeneration &&
        value.state.state_revision === envelope.observedStateRevision &&
        value.state.lifecycle_snapshot.version ===
          envelope.observedLifecycleVersion
      );
    case "read_interview_clock":
      return hasExactKeys(value, ["clock"]) && isInterviewClock(value.clock);
    case "get_probe_candidates":
      return (
        hasExactKeys(value, ["probe_candidates"]) &&
        isBoundedArray(value.probe_candidates, 0, 8, isProbeCandidate)
      );
    case "commit_interviewer_move":
      return (
        hasExactKeys(value, ["committed_move"]) &&
        isInterviewerMove(value.committed_move) &&
        value.committed_move.session_id === envelope.sessionId &&
        value.committed_move.writer_id === envelope.writerId &&
        value.committed_move.writer_generation === envelope.writerGeneration &&
        value.committed_move.based_on_state_revision + 1 ===
          envelope.observedStateRevision &&
        value.committed_move.based_on_lifecycle_version ===
          envelope.observedLifecycleVersion
      );
    case "request_graceful_close":
      return (
        hasExactKeys(value, ["close_state"]) &&
        includes(INTERVIEW_CLOSE_STATES, value.close_state)
      );
  }
}

function isRoundType(value: unknown): value is RoundType {
  return includes(
    ["behavioral", "product_sense", "execution", "strategy"] as const,
    value
  );
}

function isDifficulty(value: unknown): value is DifficultyLevel {
  return includes(["beginner", "intermediate", "advanced"] as const, value);
}

function isDuration(value: unknown): value is 15 | 30 | 45 {
  return value === 15 || value === 30 || value === 45;
}

function isInterviewerMoveType(value: unknown): value is InterviewerMoveType {
  return includes(INTERVIEWER_MOVE_TYPES, value);
}

function isMoveReasonAllowed(
  moveType: InterviewerMoveType,
  reasonCode: InterviewerMoveReasonCode
): boolean {
  if (reasonCode === "controller_fallback") return true;
  switch (moveType) {
    case "probe":
      return reasonCode === "deepen_reasoning";
    case "clarify":
      return reasonCode === "resolve_ambiguity";
    case "challenge":
      return reasonCode === "test_tradeoff";
    case "transition":
      return reasonCode === "advance_round";
    case "close":
      return (
        reasonCode === "deadline_close" ||
        reasonCode === "candidate_requested_close"
      );
  }
}

function hasRequiredSourceTurn(
  moveType: InterviewerMoveType,
  sourceTurnId: string | null
): boolean {
  return (
    sourceTurnId !== null || moveType === "transition" || moveType === "close"
  );
}

function hasBoundedPositiveTtl(
  createdAt: string,
  expiresAt: string,
  maximumMs: number
): boolean {
  const ttl = Date.parse(expiresAt) - Date.parse(createdAt);
  return ttl > 0 && ttl <= maximumMs;
}

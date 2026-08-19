import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
} from "./transcript-events";
import type {
  DirectorRecommendation,
  DirectorRecommendationEligibility,
  InterviewProbeLedgerAttribution,
  InterviewProbeLedgerEntry,
  InterviewRuntimeState,
  InterviewerToolRequest,
  InterviewerToolRequestAdmission,
  InterviewerToolResult,
  InterviewerToolResultCorrelation,
} from "./interviewer-contract-types";

export function assessDirectorRecommendation(
  recommendation: DirectorRecommendation,
  state: InterviewRuntimeState,
  now: Date | string
): DirectorRecommendationEligibility {
  if (recommendation.session_id !== state.session_id) return "session_mismatch";
  if (recommendation.brief_id !== state.brief_id) return "brief_mismatch";
  if (
    recommendation.writer_id !== state.active_writer.writer_id ||
    recommendation.writer_generation !== state.active_writer.writer_generation
  ) {
    return "stale_state";
  }
  if (recommendation.based_on_state_revision !== state.state_revision) {
    return "stale_state";
  }
  if (
    recommendation.based_on_lifecycle_version !==
    state.lifecycle_snapshot.version
  ) {
    return "stale_lifecycle";
  }
  if (recommendation.source_finality !== "finalized") {
    return "source_not_final";
  }
  if (
    recommendation.source_turn_id !== state.last_finalized_candidate_turn_id
  ) {
    return "source_turn_mismatch";
  }
  if (
    recommendation.source_transcript_revision !==
    state.last_finalized_candidate_transcript_revision
  ) {
    return "source_transcript_revision_mismatch";
  }
  if (recommendation.target.question_id !== state.active_question_id) {
    return "question_mismatch";
  }
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(nowMs)) return "not_yet_valid";
  if (
    state.clock.remaining_ms === 0 ||
    nowMs >= Date.parse(state.clock.deadline_at)
  ) {
    return "deadline_elapsed";
  }
  if (nowMs < Date.parse(recommendation.created_at)) return "not_yet_valid";
  if (nowMs > Date.parse(recommendation.expires_at)) return "expired";
  if (state.lifecycle_snapshot.state !== "active") {
    return "lifecycle_not_active";
  }
  if (state.speech_fenced) return "speech_fenced";
  if (!state.allowed_moves.includes(recommendation.move_type)) {
    return "move_not_allowed";
  }
  return "eligible";
}

export function assessInterviewerToolResultForRequest(
  request: InterviewerToolRequest,
  result: InterviewerToolResult,
  now: Date | string
): InterviewerToolResultCorrelation {
  if (result.call_id !== request.call_id) return "call_id_mismatch";
  if (result.tool_name !== request.tool_name) return "tool_name_mismatch";
  if (result.session_id !== request.session_id) return "session_mismatch";
  if (result.writer_id !== request.writer_id) return "writer_mismatch";
  if (result.writer_generation !== request.writer_generation) {
    return "writer_generation_mismatch";
  }
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(nowMs) || nowMs >= Date.parse(request.deadline_at)) {
    return "request_expired";
  }
  if (result.status !== "ok" && result.status !== "duplicate") {
    return "matched";
  }
  switch (request.tool_name) {
    case "read_interview_state":
    case "read_interview_clock":
      return "matched";
    case "get_probe_candidates":
      if (result.observed_state_revision !== request.expected_state_revision) {
        return "state_revision_mismatch";
      }
      if (
        result.observed_lifecycle_version !== request.expected_lifecycle_version
      ) {
        return "lifecycle_version_mismatch";
      }
      if (
        !result.payload ||
        !("probe_candidates" in result.payload) ||
        result.payload.probe_candidates.some(
          (candidate) => candidate.question_id !== request.active_question_id
        )
      ) {
        return "question_mismatch";
      }
      return "matched";
    case "commit_interviewer_move":
    case "request_graceful_close":
      if (
        result.observed_state_revision !==
        request.expected_state_revision + 1
      ) {
        return "state_revision_mismatch";
      }
      if (
        result.observed_lifecycle_version !== request.expected_lifecycle_version
      ) {
        return "lifecycle_version_mismatch";
      }
      return "matched";
  }
}

export function assessInterviewerToolRequestAgainstState(
  request: InterviewerToolRequest,
  state: InterviewRuntimeState,
  now: Date | string
): InterviewerToolRequestAdmission {
  if (request.session_id !== state.session_id) return "session_mismatch";
  if (
    request.writer_id !== state.active_writer.writer_id ||
    request.writer_generation !== state.active_writer.writer_generation
  ) {
    return "stale_writer";
  }
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(nowMs) || nowMs >= Date.parse(request.deadline_at)) {
    return "request_expired";
  }
  if (
    request.tool_name === "read_interview_state" ||
    request.tool_name === "read_interview_clock"
  ) {
    return "eligible";
  }
  if (
    state.clock.remaining_ms === 0 ||
    nowMs >= Date.parse(state.clock.deadline_at)
  ) {
    return "deadline_elapsed";
  }
  if (request.expected_state_revision !== state.state_revision) {
    return "stale_state";
  }
  if (request.expected_lifecycle_version !== state.lifecycle_snapshot.version) {
    return "stale_lifecycle";
  }
  if (request.tool_name === "get_probe_candidates") {
    if (request.active_question_id !== state.active_question_id) {
      return "question_mismatch";
    }
    return state.allowed_moves.includes("probe")
      ? "eligible"
      : "move_not_allowed";
  }
  if (state.lifecycle_snapshot.state !== "active") {
    return "lifecycle_not_active";
  }
  if (state.speech_fenced) return "speech_fenced";
  if (
    request.tool_name === "commit_interviewer_move" &&
    request.move.target.question_id !== state.active_question_id
  ) {
    return "question_mismatch";
  }
  const requestedMove =
    request.tool_name === "commit_interviewer_move"
      ? request.move.move_type
      : "close";
  if (!state.allowed_moves.includes(requestedMove)) {
    return "move_not_allowed";
  }
  if (
    request.tool_name === "commit_interviewer_move" &&
    nowMs > Date.parse(request.move.expires_at)
  ) {
    return "move_expired";
  }
  return "eligible";
}

export function assessInterviewProbeLedgerAttribution(
  entry: InterviewProbeLedgerEntry,
  canonicalEvidence: readonly (TranscriptEvent | TranscriptInterruptionMarker)[]
): InterviewProbeLedgerAttribution {
  const expected = entry.delivery_evidence;
  if (expected === null) return "not_required";
  const sameEventId = canonicalEvidence.filter(
    (evidence) => evidence.event_id === expected.event_id
  );
  const exactIdentity = sameEventId.filter(
    (evidence) =>
      evidence.writer_id === expected.writer_id &&
      evidence.writer_generation === expected.writer_generation &&
      evidence.sequence === expected.sequence
  );
  if (exactIdentity.length === 0) {
    return sameEventId.length === 0 ? "missing_evidence" : "identity_mismatch";
  }
  const signatures = new Set(exactIdentity.map(canonicalEvidenceSignature));
  if (signatures.size !== 1) return "ambiguous_evidence";
  const evidence = exactIdentity[0]!;
  if (expected.evidence_type === "transcript_event") {
    if (
      !("is_final" in evidence) ||
      evidence.speaker !== "interviewer" ||
      evidence.delivery_state !== expected.delivery_state
    ) {
      return "state_mismatch";
    }
    return entry.delivery_state === "interrupted" &&
      evidence.delivery_state !== "partially_delivered"
      ? "state_mismatch"
      : "attributed";
  }
  return "event_type" in evidence &&
    evidence.event_type === "integrity_unavailable" &&
    evidence.speaker === "interviewer" &&
    evidence.reason === expected.reason
    ? "attributed"
    : "state_mismatch";
}

function canonicalEvidenceSignature(
  evidence: TranscriptEvent | TranscriptInterruptionMarker
): string {
  return "is_final" in evidence
    ? JSON.stringify([
        "transcript_event",
        evidence.event_id,
        evidence.writer_id,
        evidence.writer_generation,
        evidence.sequence,
        evidence.speaker,
        evidence.text,
        evidence.delivery_state,
      ])
    : JSON.stringify([
        "interruption_marker",
        evidence.event_id,
        evidence.writer_id,
        evidence.writer_generation,
        evidence.sequence,
        evidence.speaker,
        evidence.reason,
      ]);
}

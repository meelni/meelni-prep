import {
  hasOnlyUnicodeScalarStrings,
  sha256Utf8Hex,
} from "./interview-brief-canonicalization";
import {
  InterviewerContractError,
  type CommitInterviewerMoveRequest,
  type InterviewerMutationReplayAssessment,
  type InterviewerToolRequest,
  type RequestGracefulCloseRequest,
} from "./interviewer-contract-types";

type InterviewerMutationRequest =
  | CommitInterviewerMoveRequest
  | RequestGracefulCloseRequest;

export function canonicalizeInterviewerMutationRequestPayload(
  request: InterviewerMutationRequest
): string {
  const payload =
    request.tool_name === "commit_interviewer_move"
      ? {
          contract_version: request.contract_version,
          tool_name: request.tool_name,
          session_id: request.session_id,
          writer_id: request.writer_id,
          writer_generation: request.writer_generation,
          deadline_at: request.deadline_at,
          expected_state_revision: request.expected_state_revision,
          expected_lifecycle_version: request.expected_lifecycle_version,
          move: request.move,
        }
      : {
          contract_version: request.contract_version,
          tool_name: request.tool_name,
          session_id: request.session_id,
          writer_id: request.writer_id,
          writer_generation: request.writer_generation,
          deadline_at: request.deadline_at,
          expected_state_revision: request.expected_state_revision,
          expected_lifecycle_version: request.expected_lifecycle_version,
          reason: request.reason,
        };
  if (!hasOnlyUnicodeScalarStrings(payload)) {
    throw new InterviewerContractError(
      "interviewer_tool_request",
      "invalid_payload"
    );
  }
  return canonicalJson(payload);
}

export function calculateInterviewerMutationRequestDigest(
  request: InterviewerMutationRequest
): string {
  return `sha256:${sha256Utf8Hex(
    canonicalizeInterviewerMutationRequestPayload(request)
  )}`;
}

export function assessInterviewerMutationReplay(
  original: InterviewerToolRequest,
  replay: InterviewerToolRequest
): InterviewerMutationReplayAssessment {
  if (
    !isMutationRequest(original) ||
    !isMutationRequest(replay) ||
    original.idempotency_key !== replay.idempotency_key
  ) {
    return "different_key";
  }
  return calculateInterviewerMutationRequestDigest(original) ===
    calculateInterviewerMutationRequestDigest(replay)
    ? "duplicate"
    : "idempotency_conflict";
}

function isMutationRequest(
  request: InterviewerToolRequest
): request is InterviewerMutationRequest {
  return (
    request.tool_name === "commit_interviewer_move" ||
    request.tool_name === "request_graceful_close"
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(
          (value as Record<string, unknown>)[key]
        )}`
    )
    .join(",")}}`;
}

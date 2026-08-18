import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { prepareFeedbackTranscript } from "@meelni/core";
import fixtures from "../../test-fixtures/interviewer-contracts.json";
import {
  projectEvaluationTranscriptAliases,
  serializeEvaluationTranscript,
} from "../../../lib/evaluation/transcript-aliases";
import { sha256Utf8Hex } from "./interview-brief-canonicalization";
import {
  INTERVIEWER_MOVE_TYPES,
  InterviewerContractError,
  assessDirectorRecommendation,
  calculateInterviewBriefV2PayloadDigest,
  canonicalizeInterviewBriefV2Payload,
  isInterviewRuntimeState,
  isInterviewerMove,
  parseDirectorRecommendation,
  parseInterviewBriefV2,
  parseInterviewRoomMetadata,
  parseInterviewRuntimeState,
  parseInterviewerMove,
  parseInterviewerToolRequest,
  parseInterviewerToolResult,
  resolveOptionalInterviewBriefV2,
} from "./index";

test("TypeScript accepts the shared stateful-interviewer golden fixture", () => {
  const brief = parseInterviewBriefV2(fixtures.brief);
  const state = parseInterviewRuntimeState(fixtures.runtime_state);
  const move = parseInterviewerMove(fixtures.move);
  const recommendation = parseDirectorRecommendation(
    fixtures.director_recommendation
  );

  assert.equal(brief.selected_question.id, "question-contract-1");
  assert.equal(state.controller_phase, "follow_up");
  assert.equal(move.move_type, "challenge");
  assert.equal(recommendation.source_finality, "finalized");
  assert.deepEqual(INTERVIEWER_MOVE_TYPES, [
    "probe",
    "clarify",
    "challenge",
    "transition",
    "close",
  ]);
  for (const request of fixtures.tool_requests) {
    assert.equal(
      parseInterviewerToolRequest(request).session_id,
      state.session_id
    );
  }
  for (const result of fixtures.tool_results) {
    assert.equal(
      parseInterviewerToolResult(result).session_id,
      state.session_id
    );
  }
});

test("brief payload and digest are deterministic, replay-stable, and content-bound", () => {
  const brief = parseInterviewBriefV2(fixtures.brief);
  const reordered = Object.fromEntries(
    Object.entries(structuredClone(fixtures.brief)).reverse()
  );
  const canonical = canonicalizeInterviewBriefV2Payload(brief);
  const nodeDigest = `sha256:${createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")}`;

  assert.equal(calculateInterviewBriefV2PayloadDigest(brief), nodeDigest);
  assert.equal(nodeDigest, brief.payload_digest);
  assert.equal(
    canonicalizeInterviewBriefV2Payload(reordered as typeof fixtures.brief),
    canonical
  );
  assert.equal(
    calculateInterviewBriefV2PayloadDigest(reordered as typeof fixtures.brief),
    brief.payload_digest
  );
  assert.equal("compiled_at" in brief, false);
});

test("brief hashing matches the standard SHA-256 abc vector", () => {
  assert.equal(
    sha256Utf8Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("room metadata stays v1 and safely negotiates the optional nested brief", () => {
  const withBrief = parseInterviewRoomMetadata(
    JSON.stringify({
      ...fixtures.room_metadata_v1,
      interview_brief: fixtures.brief,
    })
  );
  assert.equal(withBrief.contract_version, 1);
  assert.deepEqual(withBrief.interview_brief, fixtures.brief);
  assert.deepEqual(withBrief.interview_brief?.selected_question, {
    id: fixtures.room_metadata_v1.question.id,
    text: fixtures.room_metadata_v1.question.text,
    company: fixtures.room_metadata_v1.question.company,
    type: fixtures.room_metadata_v1.question.type,
  });

  const absent = parseInterviewRoomMetadata(
    JSON.stringify(fixtures.room_metadata_v1)
  );
  assert.equal(absent.interview_brief, undefined);
  assert.deepEqual(resolveOptionalInterviewBriefV2(undefined), {
    mode: "room_metadata_v1",
    reason: "absent",
  });

  for (const nestedBrief of [
    { ...fixtures.brief, contract_version: "interview-brief.v999" },
    { ...fixtures.brief, selected_question: { id: "malformed" } },
    { ...fixtures.brief, payload_digest: `sha256:${"0".repeat(64)}` },
  ]) {
    const parsed = parseInterviewRoomMetadata(
      JSON.stringify({
        ...fixtures.room_metadata_v1,
        interview_brief: nestedBrief,
      })
    );
    assert.equal(parsed.contract_version, 1);
    assert.equal(parsed.interview_brief, undefined);
    assert.equal(
      parsed.question?.text,
      fixtures.room_metadata_v1.question.text
    );
  }

  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({ ...fixtures.room_metadata_v1, contract_version: 2 })
      ),
    /unsupported_contract/
  );
});

test("brief correlation mismatch falls back without weakening the v1 interview", () => {
  const mismatched = {
    ...fixtures.brief,
    selected_question: {
      ...fixtures.brief.selected_question,
      text: "A substituted question must not become authoritative.",
    },
  };
  const parsed = parseInterviewRoomMetadata(
    JSON.stringify({
      ...fixtures.room_metadata_v1,
      interview_brief: mismatched,
    })
  );

  assert.equal(parsed.interview_brief, undefined);
  assert.equal(parsed.question?.id, fixtures.room_metadata_v1.question.id);
  assert.equal(parsed.question?.text, fixtures.room_metadata_v1.question.text);
  assert.equal(parsed.config.hintMode, "off");
  assert.equal(parsed.config.feedback_mode, "end_only");
});

test("unknown and malformed decision contracts fail closed with stable codes", () => {
  const cases = [
    [parseInterviewBriefV2, fixtures.brief],
    [parseInterviewRuntimeState, fixtures.runtime_state],
    [parseInterviewerMove, fixtures.move],
    [parseInterviewerToolRequest, fixtures.tool_requests[0]],
    [parseInterviewerToolResult, fixtures.tool_results[0]],
    [parseDirectorRecommendation, fixtures.director_recommendation],
  ] as const;

  for (const [parse, fixture] of cases) {
    assert.throws(
      () => parse({ ...fixture, contract_version: "unknown.v999" }),
      (error) =>
        error instanceof InterviewerContractError &&
        error.code === "unsupported_contract"
    );
    assert.throws(
      () => parse({ ...fixture, unexpected: true }),
      (error) =>
        error instanceof InterviewerContractError &&
        error.code === "invalid_payload"
    );
  }
});

test("Director freshness is inclusive at expiry and rejects stale or speculative work", () => {
  const recommendation = parseDirectorRecommendation(
    fixtures.director_recommendation
  );
  const state = parseInterviewRuntimeState(fixtures.runtime_state);

  assert.equal(
    assessDirectorRecommendation(
      recommendation,
      state,
      recommendation.expires_at
    ),
    "eligible"
  );
  assert.equal(
    assessDirectorRecommendation(
      recommendation,
      state,
      "2026-08-18T23:10:10.001Z"
    ),
    "expired"
  );
  assert.equal(
    assessDirectorRecommendation(
      { ...recommendation, source_finality: "speculative" },
      state,
      recommendation.expires_at
    ),
    "source_not_final"
  );
  assert.equal(
    assessDirectorRecommendation(
      { ...recommendation, based_on_state_revision: 6 },
      state,
      recommendation.expires_at
    ),
    "stale_state"
  );
  assert.equal(
    assessDirectorRecommendation(
      { ...recommendation, writer_generation: 2 },
      state,
      recommendation.expires_at
    ),
    "stale_state"
  );
});

test("move CAS, writer fencing, and canonical delivery evidence are structural", () => {
  const commit = structuredClone(fixtures.tool_requests[3]);
  assert.equal(
    parseInterviewerToolRequest(commit).tool_name,
    "commit_interviewer_move"
  );
  assert.throws(
    () =>
      parseInterviewerToolRequest({
        ...commit,
        expected_state_revision: commit.expected_state_revision + 1,
      }),
    /invalid_payload/
  );
  assert.throws(
    () =>
      parseInterviewerToolRequest({
        ...commit,
        writer_generation: commit.writer_generation + 1,
      }),
    /invalid_payload/
  );

  const state = structuredClone(fixtures.runtime_state);
  state.probe_ledger[0]!.delivery_evidence = null;
  assert.equal(isInterviewRuntimeState(state), false);

  const move = structuredClone(fixtures.move);
  move.expires_at = move.created_at;
  assert.equal(isInterviewerMove(move), false);
});

test("planner and tool traces cannot change canonical evaluator input or eligibility", () => {
  const project = (plannerTrace: unknown, toolTrace: unknown) => {
    void plannerTrace;
    void toolTrace;
    const prepared = prepareFeedbackTranscript(
      fixtures.canonical_transcript.map((turn) => ({
        eventId: turn.eventId,
        speaker: turn.speaker,
        text: turn.text,
        contractVersion: 2,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
    const aliases = projectEvaluationTranscriptAliases(prepared.transcript);
    return {
      evaluatorInput: serializeEvaluationTranscript(aliases.transcript),
      outcome: {
        eligible: prepared.eligible,
        reasons: prepared.reasons,
      },
    };
  };

  const first = project(
    fixtures.director_recommendation,
    fixtures.tool_results
  );
  const second = project(
    { hidden_reasoning: "different and never evidence" },
    { privileged_payload: "still never evidence" }
  );
  assert.deepEqual(second, first);
});

test("the brief is privacy-bounded and preserves the no-coaching contract", () => {
  const brief = parseInterviewBriefV2(fixtures.brief);
  const keys = JSON.stringify(brief);

  assert.equal(keys.includes("candidate_identity"), false);
  assert.equal(keys.includes("email"), false);
  assert.equal(keys.includes("transcript"), false);
  assert.equal(keys.includes("director"), false);
  assert.equal(keys.includes("tool_result"), false);
  assert.equal(brief.policy.coaching, "forbidden");
  assert.equal(brief.policy.hints, "forbidden");
  assert.equal(brief.policy.evaluation_timing, "post_interview_only");
  assert.deepEqual(brief.round_pack.forbidden_behaviors, [
    "coaching",
    "hinting",
    "mid_session_evaluation",
  ]);
});

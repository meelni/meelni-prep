import assert from "node:assert/strict";
import test from "node:test";

import fixtures from "../../test-fixtures/interviewer-contracts.json";
import {
  INTERVIEWER_MOVE_TYPES,
  InterviewerContractError,
  assessDirectorRecommendation,
  assessInterviewProbeLedgerAttribution,
  assessInterviewerMutationReplay,
  assessInterviewerToolRequestAgainstState,
  assessInterviewerToolResultForRequest,
  calculateInterviewerMutationRequestDigest,
  isInterviewRuntimeState,
  isInterviewerMove,
  isTranscriptInterruptionMarker,
  parseDirectorRecommendation,
  parseInterviewBriefV2,
  parseInterviewRoomMetadata,
  parseInterviewRuntimeState,
  parseInterviewerMove,
  parseInterviewerToolRequest,
  parseInterviewerToolResult,
  parseTranscriptEvent,
} from "./index";

function canonicalTranscript() {
  return fixtures.canonical_transcript.map((event) => {
    const parsed = parseTranscriptEvent(JSON.stringify(event));
    assert.ok(parsed && "contract_version" in parsed);
    return parsed;
  });
}

test("the shared fixture crosses the package entrypoint without deep imports", () => {
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
  fixtures.tool_requests.forEach((request) =>
    assert.equal(
      parseInterviewerToolRequest(request).session_id,
      state.session_id
    )
  );
  fixtures.tool_results.forEach((result) =>
    assert.equal(
      parseInterviewerToolResult(result).session_id,
      state.session_id
    )
  );
});

test("unknown versions and extra fields fail closed with stable codes", () => {
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

test("successful results reject cross-envelope state and move authority", () => {
  const state = fixtures.runtime_state;
  const move = fixtures.move;
  const stateResult = {
    contract_version: "interviewer-tools.v1",
    tool_name: "read_interview_state",
    call_id: "call-correlated-state-1",
    session_id: state.session_id,
    writer_id: state.active_writer.writer_id,
    writer_generation: state.active_writer.writer_generation,
    status: "ok",
    observed_state_revision: state.state_revision,
    observed_lifecycle_version: state.lifecycle_snapshot.version,
    payload: { state },
    failure_code: null,
    latency_ms: 1,
  };
  const commitResult = {
    contract_version: "interviewer-tools.v1",
    tool_name: "commit_interviewer_move",
    call_id: "call-correlated-commit-1",
    session_id: move.session_id,
    writer_id: move.writer_id,
    writer_generation: move.writer_generation,
    status: "ok",
    observed_state_revision: move.based_on_state_revision + 1,
    observed_lifecycle_version: move.based_on_lifecycle_version,
    payload: { committed_move: move },
    failure_code: null,
    latency_ms: 1,
  };
  for (const status of ["ok", "duplicate"] as const) {
    assert.equal(
      parseInterviewerToolResult({ ...stateResult, status }).status,
      status
    );
    assert.equal(
      parseInterviewerToolResult({ ...commitResult, status }).status,
      status
    );
    const statePayloads = [
      { ...state, session_id: "session-another" },
      {
        ...state,
        active_writer: { ...state.active_writer, writer_id: "writer-another" },
      },
      {
        ...state,
        active_writer: {
          ...state.active_writer,
          writer_generation: state.active_writer.writer_generation + 1,
        },
      },
      { ...state, state_revision: state.state_revision + 1 },
      {
        ...state,
        lifecycle_snapshot: {
          ...state.lifecycle_snapshot,
          version: state.lifecycle_snapshot.version + 1,
        },
      },
    ];
    const movePayloads = [
      { ...move, session_id: "session-another" },
      { ...move, writer_id: "writer-another" },
      { ...move, writer_generation: move.writer_generation + 1 },
      { ...move, based_on_state_revision: move.based_on_state_revision - 1 },
      {
        ...move,
        based_on_lifecycle_version: move.based_on_lifecycle_version + 1,
      },
    ];
    for (const payload of statePayloads) {
      assert.throws(
        () =>
          parseInterviewerToolResult({
            ...stateResult,
            status,
            payload: { state: payload },
          }),
        /invalid_payload/
      );
    }
    for (const payload of movePayloads) {
      assert.throws(
        () =>
          parseInterviewerToolResult({
            ...commitResult,
            status,
            payload: { committed_move: payload },
          }),
        /invalid_payload/
      );
    }
  }
});

test("Director admission enforces all fresh durable authorities", () => {
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
  const cases = [
    [
      { ...recommendation, source_finality: "speculative" as const },
      state,
      recommendation.expires_at,
      "source_not_final",
    ],
    [
      { ...recommendation, based_on_state_revision: 6 },
      state,
      recommendation.expires_at,
      "stale_state",
    ],
    [
      { ...recommendation, based_on_lifecycle_version: 1 },
      state,
      recommendation.expires_at,
      "stale_lifecycle",
    ],
    [
      { ...recommendation, source_transcript_revision: "revision-stale" },
      state,
      recommendation.expires_at,
      "source_transcript_revision_mismatch",
    ],
    [
      {
        ...recommendation,
        target: { ...recommendation.target, question_id: "question-another" },
      },
      state,
      recommendation.expires_at,
      "question_mismatch",
    ],
    [
      recommendation,
      {
        ...state,
        lifecycle_snapshot: {
          ...state.lifecycle_snapshot,
          state: "reconnecting" as const,
        },
      },
      recommendation.expires_at,
      "lifecycle_not_active",
    ],
    [recommendation, state, state.clock.deadline_at, "deadline_elapsed"],
    [
      recommendation,
      {
        ...state,
        clock: {
          ...state.clock,
          observed_at: state.clock.deadline_at,
          remaining_ms: 0,
          band: "elapsed" as const,
        },
        close_state: "requested" as const,
      },
      state.clock.deadline_at,
      "deadline_elapsed",
    ],
    [recommendation, state, "2026-08-18T23:30:00.001Z", "deadline_elapsed"],
    [recommendation, state, "2026-08-18T23:10:10.001Z", "expired"],
  ] as const;
  for (const [candidate, candidateState, now, expected] of cases) {
    assert.equal(
      assessDirectorRecommendation(candidate, candidateState, now),
      expected
    );
  }
});

test("runtime state rejects contradictory lifecycle, clock, close, and ledger projections", () => {
  const state = structuredClone(fixtures.runtime_state);
  const elapsedClock = {
    ...state.clock,
    observed_at: state.clock.deadline_at,
    remaining_ms: 0,
    band: "elapsed" as const,
  };
  const invalid = [
    { ...state, last_finalized_candidate_transcript_revision: null },
    {
      ...state,
      clock: { ...state.clock, remaining_ms: state.clock.remaining_ms - 1 },
    },
    { ...state, clock: { ...state.clock, band: "elapsed" } },
    { ...state, clock: elapsedClock },
    {
      ...state,
      lifecycle_snapshot: { ...state.lifecycle_snapshot, version: 0 },
    },
    { ...state, probe_ledger: [...state.probe_ledger, state.probe_ledger[0]!] },
    { ...state, controller_phase: "closing", close_state: "open" },
    { ...state, controller_phase: "follow_up", close_state: "admitted" },
  ];
  invalid.forEach((candidate) =>
    assert.equal(isInterviewRuntimeState(candidate), false)
  );
  assert.equal(
    isInterviewRuntimeState({
      ...state,
      clock: elapsedClock,
      close_state: "requested",
    }),
    true
  );
  const move = structuredClone(fixtures.move);
  move.expires_at = move.created_at;
  assert.equal(isInterviewerMove(move), false);
});

test("mutation digests make reordered retries duplicate and changed semantics conflict", () => {
  for (const raw of [fixtures.tool_requests[3], fixtures.tool_requests[4]]) {
    const original = parseInterviewerToolRequest(structuredClone(raw));
    if (
      original.tool_name !== "commit_interviewer_move" &&
      original.tool_name !== "request_graceful_close"
    ) {
      assert.fail("mutation fixture required");
    }
    assert.equal(
      calculateInterviewerMutationRequestDigest(original),
      original.request_digest
    );
    const reorderedRaw = Object.fromEntries(
      Object.entries(structuredClone(raw)).reverse()
    );
    reorderedRaw.call_id = `${original.call_id}-retry`;
    const reordered = parseInterviewerToolRequest(reorderedRaw);
    assert.equal(
      assessInterviewerMutationReplay(original, reordered),
      "duplicate"
    );
    const changed = { ...original, deadline_at: "2026-08-18T23:10:00.049Z" };
    const parsedChanged = parseInterviewerToolRequest({
      ...changed,
      request_digest: calculateInterviewerMutationRequestDigest(changed),
    });
    assert.equal(
      assessInterviewerMutationReplay(original, parsedChanged),
      "idempotency_conflict"
    );
    assert.throws(
      () => parseInterviewerToolRequest(changed),
      /invalid_payload/
    );
  }
});

test("fresh-state admission independently enforces lifecycle, question, and expiry", () => {
  const request = parseInterviewerToolRequest(fixtures.tool_requests[3]);
  const state = parseInterviewRuntimeState(fixtures.runtime_state);
  if (request.tool_name !== "commit_interviewer_move") {
    assert.fail("commit fixture required");
  }
  const now = "2026-08-18T23:10:00.049Z";
  assert.equal(
    assessInterviewerToolRequestAgainstState(request, state, now),
    "eligible"
  );
  assert.equal(
    assessInterviewerToolRequestAgainstState(
      request,
      { ...state, state_revision: state.state_revision + 1 },
      now
    ),
    "stale_state"
  );
  assert.equal(
    assessInterviewerToolRequestAgainstState(
      request,
      {
        ...state,
        lifecycle_snapshot: {
          ...state.lifecycle_snapshot,
          version: state.lifecycle_snapshot.version + 1,
        },
      },
      now
    ),
    "stale_lifecycle"
  );
  assert.equal(
    assessInterviewerToolRequestAgainstState(
      {
        ...request,
        move: {
          ...request.move,
          target: { ...request.move.target, question_id: "question-another" },
        },
      },
      state,
      now
    ),
    "question_mismatch"
  );
  const extended = { ...request, deadline_at: "2026-08-18T23:10:20.000Z" };
  const extendedRequest = parseInterviewerToolRequest({
    ...extended,
    request_digest: calculateInterviewerMutationRequestDigest(extended),
  });
  assert.equal(
    assessInterviewerToolRequestAgainstState(
      extendedRequest,
      state,
      request.move.expires_at
    ),
    "eligible"
  );
  assert.equal(
    assessInterviewerToolRequestAgainstState(
      extendedRequest,
      state,
      "2026-08-18T23:10:10.001Z"
    ),
    "move_expired"
  );
});

test("delivery attribution binds transcript identity, partial prefix, marker, and replay", () => {
  const state = parseInterviewRuntimeState(fixtures.runtime_state);
  const entry = state.probe_ledger[0]!;
  const transcript = canonicalTranscript();
  assert.equal(
    assessInterviewProbeLedgerAttribution(entry, transcript),
    "attributed"
  );
  assert.equal(
    assessInterviewProbeLedgerAttribution(entry, [
      ...transcript,
      transcript[0]!,
    ]),
    "attributed"
  );
  const partialEntry = {
    ...entry,
    delivery_state: "interrupted" as const,
    delivery_evidence: {
      ...entry.delivery_evidence!,
      evidence_type: "transcript_event" as const,
      delivery_state: "partially_delivered" as const,
    },
  };
  const partialEvent = {
    ...transcript[0]!,
    delivery_state: "partially_delivered" as const,
  };
  assert.equal(
    assessInterviewProbeLedgerAttribution(partialEntry, [partialEvent]),
    "attributed"
  );
  assert.equal(
    isInterviewRuntimeState({ ...state, probe_ledger: [partialEntry] }),
    true
  );
  const marker = fixtures.interruption_without_prefix;
  assert.ok(isTranscriptInterruptionMarker(marker));
  const markerEntry = {
    ...entry,
    delivery_state: "interrupted" as const,
    delivery_evidence: {
      evidence_type: "interruption_marker" as const,
      event_id: marker.event_id,
      writer_id: marker.writer_id,
      writer_generation: marker.writer_generation,
      sequence: marker.sequence,
      reason: "no_provider_confirmed_prefix" as const,
    },
  };
  assert.equal(
    assessInterviewProbeLedgerAttribution(markerEntry, [marker]),
    "attributed"
  );
  assert.equal(
    isInterviewRuntimeState({ ...state, probe_ledger: [markerEntry] }),
    true
  );
  assert.equal(
    assessInterviewProbeLedgerAttribution(entry, [
      { ...transcript[0]!, sequence: transcript[0]!.sequence + 1 },
    ]),
    "identity_mismatch"
  );
});

test("tool results correlate to exactly one pending request", () => {
  const request = parseInterviewerToolRequest(fixtures.tool_requests[0]);
  const result = parseInterviewerToolResult(fixtures.tool_results[0]);
  const beforeDeadline = "2026-08-18T23:10:00.049Z";
  assert.equal(
    assessInterviewerToolResultForRequest(request, result, beforeDeadline),
    "matched"
  );
  assert.equal(
    assessInterviewerToolResultForRequest(request, result, request.deadline_at),
    "request_expired"
  );
  const failure = {
    ...result,
    status: "timeout" as const,
    payload: null,
    failure_code: "timeout" as const,
  };
  const identityMatrix = [
    ["call_id_mismatch", { ...failure, call_id: "call-another" }],
    [
      "tool_name_mismatch",
      { ...failure, tool_name: "read_interview_clock" as const },
    ],
    ["session_mismatch", { ...failure, session_id: "session-another" }],
    ["writer_mismatch", { ...failure, writer_id: "writer-another" }],
    [
      "writer_generation_mismatch",
      { ...failure, writer_generation: failure.writer_generation + 1 },
    ],
  ] as const;
  for (const [expected, mismatch] of identityMatrix) {
    assert.equal(
      assessInterviewerToolResultForRequest(
        request,
        parseInterviewerToolResult(mismatch),
        beforeDeadline
      ),
      expected
    );
  }
  const probeRequest = parseInterviewerToolRequest(fixtures.tool_requests[2]);
  if (probeRequest.tool_name !== "get_probe_candidates") {
    assert.fail("probe request fixture required");
  }
  const probeResult = parseInterviewerToolResult({
    ...failure,
    tool_name: "get_probe_candidates",
    call_id: probeRequest.call_id,
    payload: { probe_candidates: [] },
    status: "ok",
    failure_code: null,
  });
  assert.equal(
    assessInterviewerToolResultForRequest(
      probeRequest,
      { ...probeResult, observed_state_revision: 8 },
      beforeDeadline
    ),
    "state_revision_mismatch"
  );
  assert.equal(
    assessInterviewerToolResultForRequest(
      probeRequest,
      { ...probeResult, observed_lifecycle_version: 3 },
      beforeDeadline
    ),
    "lifecycle_version_mismatch"
  );
  const substituted = parseInterviewerToolResult({
    ...probeResult,
    payload: {
      probe_candidates: [
        {
          probe_candidate_id: "probe-substituted-question",
          move_type: "probe",
          question_id: "question-another",
          topic: "A valid topic",
          reason_code: "deepen_reasoning",
        },
      ],
    },
  });
  assert.equal(
    assessInterviewerToolResultForRequest(
      probeRequest,
      substituted,
      beforeDeadline
    ),
    "question_mismatch"
  );
});

test("probe reason substitution and non-string wire timestamps fail closed", () => {
  const timeout = fixtures.tool_results[1];
  assert.throws(
    () =>
      parseInterviewerToolResult({
        ...timeout,
        status: "ok",
        failure_code: null,
        payload: {
          probe_candidates: [
            {
              probe_candidate_id: "probe-invalid-reason",
              move_type: "probe",
              question_id: fixtures.brief.selected_question.id,
              topic: "A valid topic",
              reason_code: "test_tradeoff",
            },
          ],
        },
      }),
    /invalid_payload/
  );
  assert.throws(
    () =>
      parseInterviewBriefV2({
        ...fixtures.brief,
        deadline_at: Date.parse(fixtures.brief.deadline_at),
      }),
    /invalid_payload/
  );
  assert.throws(
    () =>
      parseInterviewerToolRequest({
        ...fixtures.tool_requests[0],
        deadline_at: Date.parse(fixtures.tool_requests[0].deadline_at),
      }),
    /invalid_payload/
  );
  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({ ...fixtures.room_metadata_v1, contract_version: true })
      ),
    /unsupported_contract/
  );
});

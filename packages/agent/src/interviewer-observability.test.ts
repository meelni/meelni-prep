import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import wireFixtures from "../../test-fixtures/interviewer-observability-wire.json";

import {
  aggregateInterviewerObservabilityEvents,
  buildInterviewerObservabilityComparisonReport,
  INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
  isInterviewerObservabilityEvent,
  parseInterviewerObservabilityEvent,
  type InterviewerObservabilityEvent,
  type InterviewerRolloutCohort,
} from "./interviewer-observability";
import {
  DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
  INTERVIEWER_MOVE_CONTRACT_VERSION,
  INTERVIEWER_TOOL_CONTRACT_VERSION,
} from "./interviewer-contract-types";

const EMITTED_AT = "2026-08-19T01:20:00.000Z";
const THRESHOLDS = {
  minimum_runtime_count: 1,
  max_p95_user_speech_to_first_audio_increase_ms: 50,
  max_fallback_rate_increase: 0.1,
  max_repeated_probe_rate_increase: 0.1,
  max_completion_rate_drop: 0.1,
  max_stale_recommendation_rate: 0.1,
  max_tool_failure_rate: 0.1,
  max_unrecovered_interruption_rate: 0.1,
} as const;

function common(
  runtimeCorrelationId: string,
  rolloutCohort: InterviewerRolloutCohort,
  runtimeVersion: string,
  turnCorrelationId: string | null = "default-turn"
) {
  return {
    contract_version: INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION,
    runtime_correlation_id: opaqueCorrelationId("run", runtimeCorrelationId),
    turn_correlation_id:
      turnCorrelationId === null
        ? null
        : opaqueCorrelationId("turn", turnCorrelationId),
    runtime_version: runtimeVersion,
    rollout_cohort: rolloutCohort,
    emitted_at: EMITTED_AT,
  } as const;
}

function opaqueCorrelationId(prefix: "run" | "turn", seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${prefix}:${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
}

function opaqueProbeId(seed: string): string {
  return `probe:${createHash("sha256").update(seed).digest("hex")}`;
}

test("semantic events reject transcript, tool payload, identity, provider, and reasoning fields", () => {
  const safe = {
    ...common("run:privacy", "current", "current-prompt.v1"),
    event_kind: "tool",
    tool_contract_version: INTERVIEWER_TOOL_CONTRACT_VERSION,
    tool_name: "get_probe_candidates",
    tool_outcome: "ok",
    latency_ms: 18,
  } as const;

  assert.equal(isInterviewerObservabilityEvent(safe), true);
  assert.equal(
    isInterviewerObservabilityEvent({
      ...safe,
      emitted_at: "2026-02-31T01:20:00.000Z",
    }),
    false
  );
  for (const [field, value] of Object.entries({
    transcript: "synthetic candidate answer",
    tool_payload: { raw: "synthetic tool result" },
    candidate_identity: "candidate@example.test",
    provider_identity: "provider-request-123",
    hidden_reasoning: "private plan",
  })) {
    assert.equal(
      isInterviewerObservabilityEvent({ ...safe, [field]: value }),
      false,
      field
    );
  }
});

test("TypeScript and Python share canonical timestamp and ASCII wire fixtures", () => {
  for (const fixture of wireFixtures) {
    assert.equal(
      isInterviewerObservabilityEvent(fixture.event),
      fixture.valid,
      fixture.name
    );
  }
});

test("tool timeout and stale Director recommendation are closed queryable outcomes", () => {
  const timeout = parseInterviewerObservabilityEvent({
    ...common("run:timeout", "shadow", "director-shadow.v1"),
    event_kind: "tool",
    tool_contract_version: INTERVIEWER_TOOL_CONTRACT_VERSION,
    tool_name: "read_interview_state",
    tool_outcome: "timeout",
    latency_ms: 125,
  });
  const stale = parseInterviewerObservabilityEvent({
    ...common("run:timeout", "shadow", "director-shadow.v1"),
    event_kind: "director",
    recommendation_contract_version: DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    recommendation_outcome: "stale",
    recommendation_freshness: "stale",
    ready_latency_ms: 80,
    recommendation_age_ms: 500,
  });

  assert.equal(timeout.event_kind, "tool");
  assert.equal(timeout.tool_outcome, "timeout");
  assert.equal(stale.event_kind, "director");
  assert.equal(stale.recommendation_freshness, "stale");
});

test("interruption recovery, fallback, and normal close stay content-free", () => {
  const events = [
    {
      ...common("run:recovery", "canary", "adaptive-canary.v1"),
      event_kind: "interruption",
      interruption_stage: "interrupted",
      delivery_observation: "partial_prefix",
      recovery_latency_ms: null,
    },
    {
      ...common("run:recovery", "canary", "adaptive-canary.v1"),
      event_kind: "interruption",
      interruption_stage: "recovered",
      delivery_observation: "partial_prefix",
      recovery_latency_ms: 240,
    },
    {
      ...common("run:recovery", "canary", "adaptive-canary.v1"),
      event_kind: "fallback",
      fallback_reason: "director_timeout",
      fallback_source: "director",
    },
    {
      ...common("run:recovery", "canary", "adaptive-canary.v1", null),
      event_kind: "close",
      close_reason: "user_end",
      close_outcome: "settled",
      completion_status: "completed",
      completion_authority: "canonical_lifecycle",
    },
  ] as const;

  for (const event of events) {
    assert.equal(isInterviewerObservabilityEvent(event), true);
    const serialized = JSON.stringify(event);
    assert.equal(serialized.includes("transcript"), false);
    assert.equal(serialized.includes("candidate"), false);
    assert.equal(serialized.includes("provider"), false);
  }
});

test("planned and delivered moves retain safe run/turn/version/probe correlation", () => {
  const planned = parseInterviewerObservabilityEvent({
    ...common("run:move", "shadow", "director-shadow.v1", "turn:0091"),
    event_kind: "move",
    move_contract_version: INTERVIEWER_MOVE_CONTRACT_VERSION,
    move_stage: "planned",
    move_type: "probe",
    probe_target_id: opaqueProbeId("metrics_depth"),
  });
  const delivered = parseInterviewerObservabilityEvent({
    ...planned,
    move_stage: "canonically_delivered",
  });

  if (planned.event_kind !== "move" || delivered.event_kind !== "move") {
    assert.fail("expected move observability events");
  }
  assert.equal(
    planned.runtime_correlation_id,
    delivered.runtime_correlation_id
  );
  assert.equal(planned.turn_correlation_id, delivered.turn_correlation_id);
  assert.equal(planned.probe_target_id, delivered.probe_target_id);
});

test("current/shadow/canary report emits explicit rollback signals", () => {
  const events: InterviewerObservabilityEvent[] = [
    latency("run:base-1", "current", "current-prompt.v1", 100),
    move("run:base-1", "current", "current-prompt.v1", "probe:one"),
    close("run:base-1", "current", "current-prompt.v1", "completed"),
    latency("run:base-2", "current", "current-prompt.v1", 120),
    close("run:base-2", "current", "current-prompt.v1", "completed"),
    latency("run:shadow-1", "shadow", "director-shadow.v1", 105),
    move("run:shadow-1", "shadow", "director-shadow.v1", "probe:shadow"),
    close("run:shadow-1", "shadow", "director-shadow.v1", "completed"),
    tool("run:shadow-1", "shadow", "director-shadow.v1", "ok"),
    director("run:shadow-1", "shadow", "director-shadow.v1", "fresh"),
    interruption(
      "run:shadow-1",
      "shadow",
      "director-shadow.v1",
      "shadow-turn",
      "interrupted"
    ),
    interruption(
      "run:shadow-1",
      "shadow",
      "director-shadow.v1",
      "shadow-turn",
      "recovered",
      100
    ),
    latency("run:canary-1", "canary", "adaptive-canary.v1", 500),
    move("run:canary-1", "canary", "adaptive-canary.v1", "probe:repeat"),
    move("run:canary-1", "canary", "adaptive-canary.v1", "probe:repeat"),
    close("run:canary-1", "canary", "adaptive-canary.v1", "failed"),
    parseInterviewerObservabilityEvent({
      ...common("run:canary-1", "canary", "adaptive-canary.v1"),
      event_kind: "fallback",
      fallback_reason: "tool_timeout",
      fallback_source: "tool",
    }),
    parseInterviewerObservabilityEvent({
      ...common("run:canary-1", "canary", "adaptive-canary.v1"),
      event_kind: "tool",
      tool_contract_version: INTERVIEWER_TOOL_CONTRACT_VERSION,
      tool_name: "commit_interviewer_move",
      tool_outcome: "timeout",
      latency_ms: 200,
    }),
    parseInterviewerObservabilityEvent({
      ...common("run:canary-1", "canary", "adaptive-canary.v1"),
      event_kind: "director",
      recommendation_contract_version: DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
      recommendation_outcome: "stale",
      recommendation_freshness: "stale",
      ready_latency_ms: 200,
      recommendation_age_ms: 1_000,
    }),
    parseInterviewerObservabilityEvent({
      ...common("run:canary-1", "canary", "adaptive-canary.v1"),
      event_kind: "interruption",
      interruption_stage: "interrupted",
      delivery_observation: "no_prefix",
      recovery_latency_ms: null,
    }),
    interruption(
      "run:canary-1",
      "canary",
      "adaptive-canary.v1",
      "canary-recovered-turn",
      "interrupted"
    ),
    interruption(
      "run:canary-1",
      "canary",
      "adaptive-canary.v1",
      "canary-recovered-turn",
      "recovered",
      150
    ),
  ];

  const report = buildInterviewerObservabilityComparisonReport(events, {
    baselineRuntimeVersion: "current-prompt.v1",
    thresholds: THRESHOLDS,
  });

  const shadow = report.rollback_assessments.find(
    (assessment) => assessment.rollout_cohort === "shadow"
  );
  const canary = report.rollback_assessments.find(
    (assessment) => assessment.rollout_cohort === "canary"
  );
  assert.equal(shadow?.recommendation, "pass");
  assert.equal(canary?.recommendation, "rollback");
  assert.deepEqual(
    new Set(canary?.signals),
    new Set([
      "p95_user_speech_to_first_audio_regression",
      "fallback_rate_regression",
      "repeated_probe_rate_regression",
      "completion_rate_regression",
      "stale_recommendation_rate_high",
      "tool_failure_rate_high",
      "interruption_recovery_rate_low",
    ])
  );
});

test("phase-only and partial cohorts hold for insufficient metric evidence", () => {
  const phaseOnly = buildInterviewerObservabilityComparisonReport(
    [
      phase("run:phase-base", "current", "current-prompt.v1"),
      phase("run:phase-shadow", "shadow", "director-shadow.v1"),
    ],
    {
      baselineRuntimeVersion: "current-prompt.v1",
      thresholds: THRESHOLDS,
    }
  );
  assert.equal(phaseOnly.rollback_assessments[0]?.recommendation, "hold");
  assert.deepEqual(phaseOnly.rollback_assessments[0]?.signals, [
    "insufficient_sample",
  ]);

  const partial = buildInterviewerObservabilityComparisonReport(
    [
      latency("run:partial-base", "current", "current-prompt.v1", 100),
      move("run:partial-base", "current", "current-prompt.v1", "base-probe"),
      close("run:partial-base", "current", "current-prompt.v1", "completed"),
      latency("run:partial-shadow", "shadow", "director-shadow.v1", 100),
      move(
        "run:partial-shadow",
        "shadow",
        "director-shadow.v1",
        "shadow-probe"
      ),
      close("run:partial-shadow", "shadow", "director-shadow.v1", "completed"),
    ],
    {
      baselineRuntimeVersion: "current-prompt.v1",
      thresholds: THRESHOLDS,
    }
  );
  assert.equal(partial.rollback_assessments[0]?.recommendation, "hold");
  assert.ok(
    partial.rollback_assessments[0]?.signals.includes("insufficient_sample")
  );
});

test("interruption recovery correlates, deduplicates, and bounds rates", () => {
  const events = [
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "a",
      "interrupted"
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "a",
      "interrupted"
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "a",
      "recovered",
      120
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "a",
      "recovered",
      240
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "unpaired",
      "recovered",
      300
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "b",
      "interrupted"
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "b",
      "unrecovered"
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      "b",
      "recovered",
      400
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      null,
      "interrupted"
    ),
    interruption(
      "run:interruptions",
      "canary",
      "adaptive-canary.v1",
      null,
      "recovered",
      500
    ),
  ];

  const aggregate = aggregateInterviewerObservabilityEvents(events);
  assert.equal(aggregate.interruption_count, 2);
  assert.equal(aggregate.recovered_interruption_count, 1);
  assert.equal(aggregate.interruption_recovery_rate, 0.5);
  assert.equal(aggregate.interruption_recovery_ms.count, 1);
  assert.equal(aggregate.interruption_recovery_ms.p50, 120);
  assert.ok((aggregate.interruption_recovery_rate ?? 0) <= 1);
});

function latency(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  latencyMs: number
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version),
    event_kind: "latency",
    latency_kind: "user_speech_to_first_audio",
    latency_ms: latencyMs,
  });
}

function move(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  probeTargetId: string
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version),
    event_kind: "move",
    move_contract_version: INTERVIEWER_MOVE_CONTRACT_VERSION,
    move_stage: "canonically_delivered",
    move_type: "probe",
    probe_target_id: opaqueProbeId(probeTargetId),
  });
}

function phase(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version, null),
    event_kind: "phase",
    phase: "opening",
  });
}

function tool(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  outcome: "ok" | "timeout"
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version),
    event_kind: "tool",
    tool_contract_version: INTERVIEWER_TOOL_CONTRACT_VERSION,
    tool_name: "read_interview_state",
    tool_outcome: outcome,
    latency_ms: 100,
  });
}

function director(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  freshness: "fresh" | "stale"
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version),
    event_kind: "director",
    recommendation_contract_version: DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
    recommendation_outcome: freshness === "fresh" ? "ready" : "stale",
    recommendation_freshness: freshness,
    ready_latency_ms: 100,
    recommendation_age_ms: freshness === "fresh" ? 0 : 1_000,
  });
}

function interruption(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  turn: string | null,
  stage: "interrupted" | "recovered" | "unrecovered",
  recoveryLatencyMs: number | null = null
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version, turn),
    event_kind: "interruption",
    interruption_stage: stage,
    delivery_observation: "unknown",
    recovery_latency_ms: recoveryLatencyMs,
  });
}

function close(
  run: string,
  cohort: InterviewerRolloutCohort,
  version: string,
  completionStatus: "completed" | "failed"
): InterviewerObservabilityEvent {
  return parseInterviewerObservabilityEvent({
    ...common(run, cohort, version, null),
    event_kind: "close",
    close_reason:
      completionStatus === "completed" ? "user_end" : "provider_failure",
    close_outcome: completionStatus === "completed" ? "settled" : "failed",
    completion_status: completionStatus,
    completion_authority: "canonical_lifecycle",
  });
}

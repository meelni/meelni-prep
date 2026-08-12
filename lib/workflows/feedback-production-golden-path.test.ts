import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  classifyTranscriptInterruptionIntegrity,
  decodeFeedbackLifecycleResponse,
  isEvidenceLimitedFeedbackResult,
  parseEvidenceLimitedFeedback,
  presentCompletedFeedback,
  toFeedbackViewState,
  type FeedbackEvaluationResult,
  type FeedbackLifecycleResponse,
  type PersistedCompletedFeedback,
  type FeedbackV2Item,
  type PreparedFeedbackTranscript,
  type SkippedFeedbackOutcomeReason,
} from "@meelni/core";
import {
  createFeedbackGoldenPathFixtures,
  type FeedbackGoldenPathFixture,
} from "@meelni/test-fixtures";
import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";

import type {
  FeedbackGenerationRecord,
  FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import type { FinalizeInterviewSessionResult } from "@/lib/db/end-interview-session";
import {
  runFeedbackGenerationRequested,
  type FeedbackGenerationRequestedHandlerDeps,
} from "@/lib/inngest/functions/generate-feedback";
import {
  calculateValidatedSessionFromTurns,
  SessionTier,
} from "@/lib/evaluation/session-validator";
import { ingestTranscriptEvent } from "./ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "./ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "./ingest-transcript-runtime-settlement";
import { ingestTranscriptRuntimeWriter } from "./ingest-transcript-runtime-writer";
import {
  dispatchFeedbackGenerationWorkflow,
  type DispatchFeedbackGenerationDeps,
} from "./dispatch-feedback-generation";
import { finalizeInterviewSessionWorkflow } from "./end-interview-session";
import { buildTranscriptEvidenceSnapshot } from "./transcript-evidence-snapshot";
import {
  failFeedbackGenerationWorkflow,
  type FeedbackGenerationSteps,
  type GenerateFeedbackWorkflowDeps,
} from "./generate-feedback";

const NOW = new Date("2026-08-09T17:58:53.000Z");

test("provider-free production-shaped feedback lifecycle converges across all fixtures", async () => {
  const outcomes = new Map<string, string>();
  const evaluatorModes = new Map<string, Set<string>>();
  const rubricRoutes = new Set<string>();

  for (const fixture of createFeedbackGoldenPathFixtures()) {
    const result = await runFixture(fixture);
    outcomes.set(fixture.id, result.outcome);
    evaluatorModes.set(fixture.id, result.evaluatorModes);
    result.rubricRoutes.forEach((route) => rubricRoutes.add(route));
  }

  assert.equal(outcomes.get("short-rich"), "feedback_generated");
  assert.equal(outcomes.get("long-silent"), "no_reviewable_answer");
  assert.equal(outcomes.get("no-answer"), "no_reviewable_answer");
  assert.equal(
    outcomes.get("turn-marker-6m14"),
    "transcript_integrity_degraded"
  );
  assert.equal(outcomes.get("corrupt"), "transcript_integrity_degraded");
  assert.equal(outcomes.get("spoken-evidence-limited"), "feedback_generated");
  assert.deepEqual(
    evaluatorModes.get("spoken-evidence-limited"),
    new Set(["evidence_limited"])
  );
  assert.deepEqual(
    rubricRoutes,
    new Set(["product_sense", "behavioral", "strategy", "execution"])
  );
});

test("duplicate runs and late failures cannot overwrite a completed result", async () => {
  const fixture = createFeedbackGoldenPathFixtures().find(
    (candidate) => candidate.id === "normal-product-sense"
  )!;
  const result = await runFixture(fixture);

  assert.equal(result.generationStore.current.status, "completed");
  const immutable = structuredClone(result.generationStore.persisted);
  assert.equal(
    await failFeedbackGenerationWorkflow(
      {
        sessionId: fixture.sessionId,
        userId: fixture.userId,
        eventId: result.generationStore.current.eventId!,
        reason: "late_provider_failure",
      },
      {
        store: result.generationStore,
        getSession: async () => ({
          userId: fixture.userId,
          roundType: fixture.roundType,
        }),
        isDeletionPending: async () => false,
      }
    ),
    false
  );
  assert.deepEqual(result.generationStore.persisted, immutable);
});

async function runFixture(fixture: FeedbackGoldenPathFixture) {
  const stages: string[] = [];
  const evidence = new MemoryEvidenceStore();
  const writer = await ingestTranscriptRuntimeWriter({
    requestSessionId: fixture.sessionId,
    registration: fixture.writerRegistration,
    store: evidence,
  });
  assert.equal(writer.ok, true, fixture.id);
  const writerReplay = await ingestTranscriptRuntimeWriter({
    requestSessionId: fixture.sessionId,
    registration: fixture.writerRegistration,
    store: evidence,
  });
  assert.deepEqual(writerReplay.ok && writerReplay.disposition, "existing");
  stages.push("writer_registration");

  const reorderedEvents = [...fixture.events].reverse();
  for (const event of reorderedEvents) {
    const ingested = await ingestTranscriptEvent({
      requestSessionId: fixture.sessionId,
      principal: { kind: "voice_runtime" },
      event,
      store: evidence,
    });
    assert.equal(ingested.ok, true, `${fixture.id}:${event.event_id}`);
  }
  for (const event of fixture.events.slice(0, 1)) {
    const duplicate = await ingestTranscriptEvent({
      requestSessionId: fixture.sessionId,
      principal: { kind: "voice_runtime" },
      event,
      store: evidence,
    });
    assert.deepEqual(duplicate.ok && duplicate.disposition, "existing");
  }
  stages.push("transcript_ingest");

  for (const marker of fixture.markers) {
    const markerResult = await ingestTranscriptInterruptionMarker({
      requestSessionId: fixture.sessionId,
      marker,
      store: evidence,
    });
    assert.equal(markerResult.ok, true, fixture.id);
    const markerReplay = await ingestTranscriptInterruptionMarker({
      requestSessionId: fixture.sessionId,
      marker,
      store: evidence,
    });
    assert.deepEqual(markerReplay.ok && markerReplay.disposition, "existing");
  }
  stages.push("marker_ingest");

  if (fixture.ingestSettlement) {
    const settlement = await ingestTranscriptRuntimeSettlement({
      requestSessionId: fixture.sessionId,
      settlement: fixture.settlement,
      store: evidence,
    });
    assert.equal(settlement.ok, true, fixture.id);
  }
  stages.push("settlement_ingest");

  const turns = evidence.orderedTurns();
  const validation = calculateValidatedSessionFromTurns(
    turns.map((turn) => ({
      eventId: turn.event_id,
      contractVersion: turn.contract_version,
      speaker: turn.speaker,
      text: turn.text,
      startedAt: new Date(turn.started_at),
      endedAt: new Date(turn.ended_at),
    }))
  );
  if (fixture.id === "spoken-evidence-limited") {
    assert.equal(validation.stats.userTurns, 6);
    assert.equal(validation.stats.substantiveResponses, 6);
    assert.equal(validation.stats.scoreableResponses, 0);
    assert.equal(validation.tier, SessionTier.PARTIAL);
  }
  const committedSequence = evidence.committedSequence();
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt: new Date(fixture.settlement.settled_at),
    interruptions: [...evidence.markers.values()].map((marker) => ({
      speaker: marker.speaker,
      reason: marker.reason,
    })),
    writers: [
      {
        generation: 1,
        contractVersion: 1,
        writerId: fixture.writerId,
        lastObservedSequence: evidence.lastObservedSequence(),
        committedSequence,
        committedEventId: evidence.eventIdForSequence(committedSequence),
        committedThroughAt: evidence.timeForSequence(committedSequence),
        integrityState: fixture.markers.some(
          (marker) =>
            classifyTranscriptInterruptionIntegrity({
              speaker: marker.speaker,
              reason: marker.reason,
            }) === "degrade"
        )
          ? "degraded"
          : "healthy",
        settlementState: fixture.ingestSettlement
          ? fixture.settlement.state
          : null,
        settledAt: fixture.ingestSettlement
          ? new Date(fixture.settlement.settled_at)
          : null,
      },
    ],
    baseValidation: validation,
  });

  const outcomeReason: SkippedFeedbackOutcomeReason | null =
    snapshot.state === "degraded"
      ? "transcript_integrity_degraded"
      : snapshot.validation.isValid
        ? null
        : "no_reviewable_answer";
  const eventId = `feedback/generate.requested:${fixture.sessionId}:1`;
  const appliedCompletion = frozenEndCompletion(
    fixture,
    snapshot,
    outcomeReason,
    eventId
  );
  let finalizationCalls = 0;
  const endDeps = {
    authorize: async () => true,
    finalize: async () => {
      finalizationCalls += 1;
      return finalizationCalls === 1
        ? appliedCompletion
        : ({ ...appliedCompletion, disposition: "existing" } as const);
    },
  };
  const endInput = {
    sessionId: fixture.sessionId,
    actor: { type: "user" as const, userId: fixture.userId },
    requestedTerminalReason: "user_end" as const,
  };
  const firstEnd = await finalizeInterviewSessionWorkflow(endInput, endDeps);
  const duplicateEnd = await finalizeInterviewSessionWorkflow(
    endInput,
    endDeps
  );
  assert.equal(firstEnd.ok && firstEnd.disposition, "applied");
  assert.equal(duplicateEnd.ok && duplicateEnd.disposition, "existing");
  assert.equal(finalizationCalls, 2);
  if (firstEnd.ok && duplicateEnd.ok) {
    assert.deepEqual(duplicateEnd.stats, firstEnd.stats);
    assert.deepEqual(duplicateEnd.feedback, firstEnd.feedback);
  }
  stages.push("end_frozen_evidence");

  const generationStore = new MemoryGenerationStore({
    sessionId: fixture.sessionId,
    status: outcomeReason ? "skipped" : "pending",
    statusReason: outcomeReason,
    outcomeReason,
    eventId: outcomeReason ? null : eventId,
    processingStartedAt: null,
    completionTier: snapshot.validation.tier,
    completionStats: snapshot.validation.stats,
    dispatchStatus: outcomeReason ? "not_required" : "pending",
    dispatchClaimedAt: null,
    dispatchedAt: null,
  });
  assert.notEqual(
    generationStore.current.status,
    "completed",
    "golden path must not insert terminal feedback directly"
  );

  if (outcomeReason) {
    const response = skippedResponse(outcomeReason, snapshot.validation.tier);
    const decoded = decodeFeedbackLifecycleResponse(response);
    assert.ok(decoded && decoded.status === "skipped", fixture.id);
    const view = toFeedbackViewState(decoded);
    assert.equal(
      view.kind,
      outcomeReason === "transcript_integrity_degraded"
        ? "transcript-integrity-degraded"
        : "no-reviewable-answer"
    );
    const serialized = JSON.stringify(response);
    assert.doesNotMatch(
      serialized,
      /duration|microphone|answer quality|try harder/i
    );
    stages.push("api_view_model");
    return {
      outcome: outcomeReason,
      rubricRoutes: new Set<string>(),
      evaluatorModes: new Set<string>(),
      stages,
      generationStore,
    };
  }

  const sent: Array<{ id: string; data: unknown }> = [];
  const dispatchDeps = createDispatchDeps(generationStore, sent);
  const dispatched = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      tier: snapshot.validation.tier,
    },
    dispatchDeps
  );
  assert.deepEqual(dispatched.ok && dispatched.disposition, "sent");
  const duplicateDispatch = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      tier: snapshot.validation.tier,
    },
    dispatchDeps
  );
  assert.deepEqual(
    duplicateDispatch.ok && duplicateDispatch.disposition,
    "already_sent"
  );
  assert.equal(sent.length, 1);
  stages.push("durable_dispatch");

  const rubricRoutes = new Set<string>();
  const evaluatorModes = new Set<string>();
  const prepared: PreparedFeedbackTranscript = {
    eligible: true,
    transcript: turns.map((turn) => ({
      eventId: turn.event_id,
      speaker: turn.speaker,
      text: turn.text,
      deliveryState: turn.delivery_state,
    })),
    issues: [],
    reasons: [],
    duplicateTurnsRemoved: 0,
  };
  const steps: FeedbackGenerationSteps = {
    run: (_name, work) => work(),
    async sendInsights() {},
  };
  const handlerDeps: FeedbackGenerationRequestedHandlerDeps = {
    now: () => NOW.getTime(),
    createWorkflowDeps: (handlerSteps) =>
      createGenerationDeps({
        fixture,
        store: generationStore,
        steps: handlerSteps,
        transcript: prepared,
        stages,
        rubricRoutes,
        evaluatorModes,
      }),
    reportResult() {},
  };
  const handled = await runFeedbackGenerationRequested({
    eventId,
    data: { sessionId: fixture.sessionId, userId: fixture.userId },
    steps,
    deps: handlerDeps,
  });
  assert.equal(handled.status, "completed");
  assert.equal(generationStore.completeCount, 1);
  stages.push("immutable_persistence");
  stages.push("inngest_handler");
  const duplicateRun = await runFeedbackGenerationRequested({
    eventId,
    data: { sessionId: fixture.sessionId, userId: fixture.userId },
    steps,
    deps: handlerDeps,
  });
  assert.equal(duplicateRun.disposition, "already_terminal");
  assert.equal(generationStore.completeCount, 1);

  const persisted = generationStore.persisted!;
  const feedbackView = presentCompletedFeedback(
    {
      id: `feedback:${fixture.id}`,
      sessionId: fixture.sessionId,
      ...persisted,
      createdAt: NOW.toISOString(),
    },
    {
      evidenceTurns: turns
        .filter((turn) => turn.speaker === "user")
        .map((turn) => ({
          eventId: turn.event_id,
          speaker: turn.speaker,
          text: turn.text,
          contractVersion: turn.contract_version,
        })),
    }
  );
  assert.notEqual(feedbackView.kind, "invalid", fixture.id);
  const lifecyclePayload: FeedbackLifecycleResponse = {
    status: "completed",
    retryable: false,
    feedback: feedbackView,
  };
  const decoded = decodeFeedbackLifecycleResponse(lifecyclePayload);
  assert.ok(decoded && decoded.status === "completed", fixture.id);
  const view = toFeedbackViewState(decoded);
  assert.ok(
    view.kind === "completed-full" ||
      view.kind === "completed-partial" ||
      view.kind === "completed-evidence-limited",
    fixture.id
  );
  if (view.kind === "completed-evidence-limited") {
    const candidateTurn = turns.find((turn) => turn.speaker === "user");
    assert.ok(candidateTurn, fixture.id);
    assert.equal(
      view.feedback.strengths[0]?.evidence[0]?.quote,
      candidateTurn.text,
      fixture.id
    );
    assert.match(view.feedback.strengths[0]?.signalCode ?? "", /_/);
    assert.match(view.feedback.improvements[0]?.actionCode ?? "", /_/);
  }
  stages.push("api_view_model");
  assert.deepEqual(stages, [
    "writer_registration",
    "transcript_ingest",
    "marker_ingest",
    "settlement_ingest",
    "end_frozen_evidence",
    "durable_dispatch",
    "evaluator",
    "immutable_persistence",
    "inngest_handler",
    "api_view_model",
  ]);
  return {
    outcome: "feedback_generated",
    rubricRoutes,
    evaluatorModes,
    stages,
    generationStore,
  };
}

function frozenEndCompletion(
  fixture: FeedbackGoldenPathFixture,
  snapshot: ReturnType<typeof buildTranscriptEvidenceSnapshot>,
  outcomeReason: SkippedFeedbackOutcomeReason | null,
  eventId: string
): Extract<FinalizeInterviewSessionResult, { ok: true }> {
  const completed = snapshot.validation.isValid;
  return {
    ok: true,
    disposition: "applied",
    userId: fixture.userId,
    roomName: fixture.roomName,
    lifecycle: {
      state: completed ? "completed" : "abandoned",
      version: 2,
      terminalReason: completed ? "user_end" : "insufficient_signal",
      endingAt: NOW,
      endedAt: NOW,
    },
    transcriptEvidence:
      snapshot.state === "complete"
        ? "available"
        : snapshot.state === "partial"
          ? "partial"
          : snapshot.state === "degraded"
            ? "degraded"
            : "missing",
    feedback: {
      id: `00000000-0000-4000-8000-${fixture.sessionId.slice(-12)}`,
      sessionId: fixture.sessionId,
      structureScore: null,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
      overallScore: null,
      strengths: null,
      improvements: null,
      drills: null,
      summary: null,
      createdAt: NOW,
      status: outcomeReason ? "skipped" : "pending",
      statusReason: outcomeReason,
      outcomeReason,
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
      processingStartedAt: null,
      processingDurationMs: null,
      completionTier: snapshot.validation.tier,
      completionStats: snapshot.validation.stats,
      completionRecommendations: [],
      dispatchStatus: outcomeReason ? "not_required" : "pending",
      dispatchEventId: outcomeReason ? null : eventId,
      dispatchAttempts: 0,
      dispatchClaimedAt: null,
      dispatchedAt: null,
      dispatchLastError: null,
    },
    deadlineRoomCleanupStatus: null,
    stats: snapshot.validation.stats,
    tier: snapshot.validation.tier,
    recommendations: [],
  };
}

function createGenerationDeps(input: {
  fixture: FeedbackGoldenPathFixture;
  store: MemoryGenerationStore;
  steps: FeedbackGenerationSteps;
  transcript: PreparedFeedbackTranscript;
  stages: string[];
  rubricRoutes: Set<string>;
  evaluatorModes: Set<string>;
}): GenerateFeedbackWorkflowDeps {
  return {
    store: input.store,
    steps: input.steps,
    now: () => NOW,
    isDeletionPending: async () => false,
    getSession: async () => ({
      userId: input.fixture.userId,
      roundType: input.fixture.roundType,
      endingAtMs: NOW.getTime() - 1_000,
    }),
    validateLegacy: async () => {
      throw new Error("golden_path_never_uses_legacy_validation");
    },
    getTranscript: async () => input.transcript,
    evaluate: async ({ roundType, transcript, mode, evaluationState }) => {
      input.stages.push("evaluator");
      input.rubricRoutes.add(roundType);
      input.evaluatorModes.add(mode);
      const candidateTurns = transcript.filter(
        (turn) => turn.speaker === "user"
      );
      return mode === "evidence_limited"
        ? evidenceLimitedEvaluation(roundType, candidateTurns[0]!)
        : scoredEvaluation(candidateTurns, evaluationState);
    },
  };
}

function evidenceLimitedEvaluation(
  roundType: string,
  turn: PreparedFeedbackTranscript["transcript"][number]
): FeedbackEvaluationResult {
  const route = {
    product_sense: {
      strength: "customer_problem_connection" as const,
      strengthAction: "connect_customer_to_decision" as const,
      improvement: "tradeoff_decision" as const,
      improvementAction: "compare_tradeoffs_and_choose" as const,
    },
    behavioral: {
      strength: "tradeoff_ownership" as const,
      strengthAction: "compare_tradeoffs_and_choose" as const,
      improvement: "main_point_focus" as const,
      improvementAction: "state_point_then_support" as const,
    },
    strategy: {
      strength: "tradeoff_ownership" as const,
      strengthAction: "compare_tradeoffs_and_choose" as const,
      improvement: "customer_decision_connection" as const,
      improvementAction: "connect_customer_to_decision" as const,
    },
    execution: {
      strength: "customer_problem_connection" as const,
      strengthAction: "connect_customer_to_decision" as const,
      improvement: "structure_progression" as const,
      improvementAction: "outline_reasoning" as const,
    },
  }[roundType] ?? {
    strength: "structured_reasoning" as const,
    strengthAction: "outline_reasoning" as const,
    improvement: "recommendation_directness" as const,
    improvementAction: "lead_with_recommendation" as const,
  };
  return parseEvidenceLimitedFeedback(
    {
      schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      evaluationState: "partial",
      strengths: [
        {
          signalCode: route.strength,
          actionCode: route.strengthAction,
          transcriptRef: turn.eventId,
        },
      ],
      improvements: [
        {
          signalCode: route.improvement,
          actionCode: route.improvementAction,
          transcriptRef: turn.eventId,
        },
      ],
    },
    {
      transcript: [turn],
      modelVersion: "fake-evaluator-v2",
    }
  );
}

function scoredEvaluation(
  turns: PreparedFeedbackTranscript["transcript"],
  evaluationState: "full" | "partial"
): FeedbackEvaluationResult {
  const candidateTurns = turns.filter((turn) => turn.speaker === "user");
  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: "fake-evaluator-v1",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState,
    scores: {
      structure: 7,
      clarity: 7,
      insight: 7,
      communication: 7,
      leadership: 7,
    },
    overallScore: 7,
    strengths: [
      finding(
        candidateTurns[0]!,
        "insight",
        "The answer identifies concrete evidence."
      ),
    ],
    improvements: [
      finding(
        candidateTurns[1]!,
        "structure",
        "The answer can state a decision threshold earlier."
      ),
    ],
    drills: ["Focused practice: state one decision threshold."],
    summary:
      "The cited answers show specific reasoning and a next step for structure.",
  };
}

function finding(
  turn: PreparedFeedbackTranscript["transcript"][number],
  dimension: FeedbackV2Item["dimension"],
  observation: string
): FeedbackV2Item {
  return {
    dimension,
    observation,
    transcriptRefs: [turn.eventId],
    evidence: [{ turnRef: turn.eventId, quote: turn.text }],
    nextStep: "Use this exact evidence in the next focused practice answer.",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: 0.7,
  };
}

function skippedResponse(
  outcomeReason: SkippedFeedbackOutcomeReason,
  tier: SessionTier
): FeedbackLifecycleResponse {
  return {
    status: "skipped",
    retryable: false,
    details: {
      outcomeReason,
      tier: tier === SessionTier.ABANDONED ? "abandoned" : "insufficient",
      reasons: [],
      recommendations: [],
    },
  };
}

class MemoryEvidenceStore {
  writer: TranscriptRuntimeWriterRegistration | null = null;
  turns = new Map<string, TranscriptEvent>();
  markers = new Map<string, TranscriptInterruptionMarker>();
  settlement: TranscriptRuntimeSettlement | null = null;
  private sequenceIdentity = new Map<number, string>();

  async register(registration: TranscriptRuntimeWriterRegistration) {
    if (this.writer) {
      return {
        ok: true as const,
        disposition: "existing" as const,
        writer: this.writer,
        writerGeneration: 1,
      };
    }
    this.writer = registration;
    return {
      ok: true as const,
      disposition: "created" as const,
      writer: registration,
      writerGeneration: 1,
    };
  }

  async persist(
    input:
      | {
          principal:
            | { kind: "voice_runtime" }
            | { kind: "authenticated_user"; userId: string };
          event: TranscriptEvent;
        }
      | TranscriptInterruptionMarker
      | TranscriptRuntimeSettlement
  ): Promise<any> {
    if ("event" in input) return this.persistTurn(input.event);
    if (input.event_type === "integrity_unavailable") {
      return this.persistMarker(input);
    }
    const existing = this.settlement;
    if (existing) {
      return {
        ok: true,
        disposition: "existing",
        settlement: existing,
      };
    }
    this.settlement = input;
    return { ok: true, disposition: "created", settlement: input };
  }

  async convergeCredit() {}

  orderedTurns(): TranscriptEvent[] {
    return [...this.turns.values()].sort(
      (left, right) => left.sequence - right.sequence
    );
  }

  lastObservedSequence(): number {
    return Math.max(0, ...this.sequenceIdentity.keys());
  }

  committedSequence(): number {
    let sequence = 0;
    while (this.sequenceIdentity.has(sequence + 1)) sequence += 1;
    return sequence;
  }

  eventIdForSequence(sequence: number): string | null {
    return sequence === 0
      ? null
      : (this.sequenceIdentity.get(sequence) ?? null);
  }

  timeForSequence(sequence: number): Date | null {
    const eventId = this.eventIdForSequence(sequence);
    if (!eventId) return null;
    const turn = this.turns.get(eventId);
    if (turn) return new Date(turn.ended_at);
    const marker = this.markers.get(eventId);
    return marker ? new Date(marker.occurred_at) : null;
  }

  private persistTurn(event: TranscriptEvent) {
    const existing = this.turns.get(event.event_id);
    if (existing) {
      assert.deepEqual(existing, event);
      return { ok: true, disposition: "existing", turn: existing } as const;
    }
    this.reserveSequence(event.sequence, event.event_id);
    this.turns.set(event.event_id, event);
    return { ok: true, disposition: "created", turn: event } as const;
  }

  private persistMarker(marker: TranscriptInterruptionMarker) {
    const existing = this.markers.get(marker.event_id);
    if (existing) {
      assert.deepEqual(existing, marker);
      return { ok: true, disposition: "existing", marker: existing } as const;
    }
    this.reserveSequence(marker.sequence, marker.event_id);
    this.markers.set(marker.event_id, marker);
    return { ok: true, disposition: "created", marker } as const;
  }

  private reserveSequence(sequence: number, eventId: string) {
    const existing = this.sequenceIdentity.get(sequence);
    assert.ok(!existing || existing === eventId, "writer_sequence_conflict");
    this.sequenceIdentity.set(sequence, eventId);
  }
}

class MemoryGenerationStore implements FeedbackGenerationStore {
  completeCount = 0;
  persisted: Omit<
    PersistedCompletedFeedback,
    "id" | "sessionId" | "createdAt"
  > | null = null;

  constructor(public current: FeedbackGenerationRecord) {}

  async get(sessionId: string) {
    return this.current.sessionId === sessionId ? { ...this.current } : null;
  }

  async claim(input: { sessionId: string; eventId: string; now: Date }) {
    if (
      this.current.sessionId !== input.sessionId ||
      this.current.eventId !== input.eventId ||
      (this.current.status !== "pending" && this.current.status !== "failed")
    ) {
      return null;
    }
    this.current = {
      ...this.current,
      status: "processing",
      statusReason: null,
      outcomeReason: null,
      processingStartedAt: input.now,
    };
    return { ...this.current };
  }

  async complete(input: {
    sessionId: string;
    eventId: string;
    evaluation: FeedbackEvaluationResult;
    processingDurationMs: number;
  }) {
    if (!this.active(input)) return false;
    if (isEvidenceLimitedFeedbackResult(input.evaluation)) {
      this.persisted = {
        structureScore: null,
        clarityScore: null,
        insightScore: null,
        communicationScore: null,
        leadershipScore: null,
        overallScore: null,
        strengths: input.evaluation.strengths,
        improvements: input.evaluation.improvements,
        drills: [],
        summary: input.evaluation.summary,
        rubricVersion: input.evaluation.rubricVersion,
        schemaVersion: input.evaluation.schemaVersion,
        promptVersion: input.evaluation.promptVersion,
        modelVersion: input.evaluation.modelVersion,
        evaluationState: input.evaluation.evaluationState,
      };
    } else {
      this.persisted = {
        structureScore: input.evaluation.scores.structure,
        clarityScore: input.evaluation.scores.clarity,
        insightScore: input.evaluation.scores.insight,
        communicationScore: input.evaluation.scores.communication,
        leadershipScore: input.evaluation.scores.leadership,
        overallScore: input.evaluation.overallScore.toString(),
        strengths: input.evaluation.strengths,
        improvements: input.evaluation.improvements,
        drills: input.evaluation.drills,
        summary: input.evaluation.summary,
        rubricVersion: input.evaluation.rubricVersion,
        schemaVersion: input.evaluation.schemaVersion,
        promptVersion: input.evaluation.promptVersion,
        modelVersion: input.evaluation.modelVersion,
        evaluationState: input.evaluation.evaluationState,
      };
    }
    this.current = {
      ...this.current,
      status: "completed",
      outcomeReason: "feedback_generated",
    };
    this.completeCount += 1;
    return true;
  }

  async skip(input: {
    sessionId: string;
    eventId: string;
    reason: SkippedFeedbackOutcomeReason;
    completionTier?: "insufficient";
  }) {
    if (!this.active(input)) return false;
    this.current = {
      ...this.current,
      status: "skipped",
      statusReason: input.reason,
      outcomeReason: input.reason,
      completionTier: input.completionTier ?? this.current.completionTier,
    };
    return true;
  }

  async fail(input: { sessionId: string; eventId: string; reason: string }) {
    if (!this.active(input)) return false;
    this.current = {
      ...this.current,
      status: "failed",
      statusReason: input.reason,
      outcomeReason: "generation_failed",
    };
    return true;
  }

  async prepareRetry() {
    return { prepared: false, record: { ...this.current } };
  }

  private active(input: { sessionId: string; eventId: string }) {
    return (
      this.current.sessionId === input.sessionId &&
      this.current.eventId === input.eventId &&
      this.current.status === "processing"
    );
  }
}

function createDispatchDeps(
  store: MemoryGenerationStore,
  sent: Array<{ id: string; data: unknown }>
): DispatchFeedbackGenerationDeps {
  const dispatchStore: DispatchFeedbackGenerationDeps["store"] = {
    async get() {
      return {
        sessionId: store.current.sessionId,
        eventId: store.current.eventId,
        status: store.current.dispatchStatus,
        attempts: store.current.dispatchStatus === "pending" ? 0 : 1,
        claimedAt: store.current.dispatchClaimedAt,
        dispatchedAt: store.current.dispatchedAt,
      };
    },
    async claim({ now }) {
      if (store.current.dispatchStatus !== "pending") return null;
      store.current = {
        ...store.current,
        dispatchStatus: "sending",
        dispatchClaimedAt: now,
      };
      return {
        sessionId: store.current.sessionId,
        eventId: store.current.eventId,
        status: "sending",
        attempts: 1,
        claimedAt: now,
        dispatchedAt: null,
      };
    },
    async markSent({ now }) {
      if (store.current.dispatchStatus !== "sending") return false;
      store.current = {
        ...store.current,
        dispatchStatus: "sent",
        dispatchedAt: now,
      };
      return true;
    },
    async markFailed() {
      store.current = {
        ...store.current,
        dispatchStatus: "failed",
        outcomeReason: "dispatch_failed",
      };
      return true;
    },
  };
  return {
    store: dispatchStore,
    now: () => NOW,
    reportFailure() {},
    async send(event) {
      sent.push({ id: event.id, data: event.data });
    },
  };
}

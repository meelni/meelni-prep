import assert from "node:assert/strict";

import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  classifyTranscriptInterruptionIntegrity,
  decodeFeedbackLifecycleResponse,
  isDimensionCoverageFeedbackResult,
  parseDimensionCoverageProviderSelection,
  type CandidateAnswerBlock,
  type DimensionCoverageProviderSelection,
  type FeedbackEvaluationResult,
  type FeedbackLifecycleResponse,
  type PersistedCompletedFeedback,
  type SkippedFeedbackOutcomeReason,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";
import type { FeedbackGoldenPathFixture } from "@meelni/test-fixtures";
import {
  SYNTHETIC_FEEDBACK_GENERATED_STAGES,
  type SyntheticFeedbackStage,
} from "@meelni/test-fixtures/synthetic-feedback";

import type { FeedbackGenerationRecord } from "@/lib/db/feedback-generation-state";
import type { FeedbackGenerationStore } from "@/lib/db/feedback-generation-state";
import type { FinalizeInterviewSessionResult } from "@/lib/db/end-interview-session";
import {
  runFeedbackGenerationRequested,
  type FeedbackGenerationRequestedHandlerDeps,
} from "@/lib/inngest/functions/generate-feedback";
import {
  calculateValidatedSessionFromTurns,
  prepareCandidateAnswerBlockEvidenceFromTurns,
  prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot,
} from "@/lib/evaluation/session-validator";
import {
  buildCompletedFeedbackLifecycleResponse,
  buildSkippedFeedbackLifecycleResponse,
} from "@/lib/feedback-lifecycle-response";
import {
  ingestTranscriptEvent,
  type PersistTranscriptEventResult,
} from "./ingest-transcript-event";
import {
  ingestTranscriptInterruptionMarker,
  type PersistTranscriptInterruptionMarkerResult,
} from "./ingest-transcript-interruption-marker";
import {
  ingestTranscriptRuntimeSettlement,
  type PersistTranscriptRuntimeSettlementResult,
} from "./ingest-transcript-runtime-settlement";
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

const SYNTHETIC_NOW = new Date("2026-08-09T17:58:53.000Z");

export const FEEDBACK_PRODUCTION_SCENARIO_STAGES =
  SYNTHETIC_FEEDBACK_GENERATED_STAGES;

export type FeedbackProductionScenarioStage = SyntheticFeedbackStage;

export type SyntheticFeedbackEvaluationCoverage = "complete" | "sparse";

export interface SyntheticFeedbackEvaluationInput {
  roundType: FeedbackGoldenPathFixture["roundType"];
  answerBlocks: readonly CandidateAnswerBlock[];
  allowNumericalScores: boolean;
  verifiedPrefixProjection?: TrustedAnswerBlockProjection;
  coverage: SyntheticFeedbackEvaluationCoverage;
}

/**
 * Explicit seam for a separately authorized future live-model adapter. The
 * repository supplies only the deterministic implementation in this slice.
 */
export interface SyntheticFeedbackEvaluatorAdapter {
  readonly executionMode:
    | "deterministic_provider_free"
    | "live_model_explicit_opt_in";
  evaluate(
    input: SyntheticFeedbackEvaluationInput
  ): Promise<FeedbackEvaluationResult>;
}

export interface FeedbackProductionScenarioOptions {
  evaluatorCoverage?: SyntheticFeedbackEvaluationCoverage;
  persistedResultMutation?: "unknown_schema_version";
  evaluator?: SyntheticFeedbackEvaluatorAdapter;
}

export interface FeedbackProductionScenarioReplayDiagnostics {
  writerRegistration: "existing";
  transcriptEvent: "existing" | "not_available";
  interruptionMarker: "existing" | "not_available";
  interviewEnd: "existing";
  dispatch: "already_sent" | "not_required";
  generation: "already_terminal" | "not_required";
  lateFailureApplied: false | "not_required";
  persistenceWrites: 0 | 1;
}

export interface FeedbackProductionScenarioResult {
  lifecycle: FeedbackLifecycleResponse;
  executionMode: SyntheticFeedbackEvaluatorAdapter["executionMode"];
  stages: FeedbackProductionScenarioStage[];
  durableStepRoundTrips: string[];
  replay: FeedbackProductionScenarioReplayDiagnostics;
}

export function createDeterministicSyntheticFeedbackEvaluator(): SyntheticFeedbackEvaluatorAdapter {
  return {
    executionMode: "deterministic_provider_free",
    async evaluate(input) {
      return dimensionCoverageEvaluation(input);
    },
  };
}

export async function runFeedbackProductionScenario(
  fixture: FeedbackGoldenPathFixture,
  options: FeedbackProductionScenarioOptions = {}
): Promise<FeedbackProductionScenarioResult> {
  const evaluator =
    options.evaluator ?? createDeterministicSyntheticFeedbackEvaluator();
  const stages: FeedbackProductionScenarioStage[] = [];
  const durableStepRoundTrips: string[] = [];
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
  assert.equal(writerReplay.ok && writerReplay.disposition, "existing");
  stages.push("writer_registration");

  for (const event of [...fixture.events].reverse()) {
    const ingested = await ingestTranscriptEvent({
      requestSessionId: fixture.sessionId,
      principal: { kind: "voice_runtime" },
      event,
      store: evidence,
    });
    assert.equal(ingested.ok, true, `${fixture.id}:${event.event_id}`);
  }
  const firstEvent = fixture.events[0];
  let transcriptReplay: "existing" | "not_available" = "not_available";
  if (firstEvent) {
    const duplicate = await ingestTranscriptEvent({
      requestSessionId: fixture.sessionId,
      principal: { kind: "voice_runtime" },
      event: firstEvent,
      store: evidence,
    });
    assert.equal(duplicate.ok && duplicate.disposition, "existing");
    transcriptReplay = "existing";
  }
  stages.push("transcript_ingest");

  let markerReplay: "existing" | "not_available" = "not_available";
  for (const marker of fixture.markers) {
    const markerResult = await ingestTranscriptInterruptionMarker({
      requestSessionId: fixture.sessionId,
      marker,
      store: evidence,
    });
    assert.equal(markerResult.ok, true, fixture.id);
    const duplicate = await ingestTranscriptInterruptionMarker({
      requestSessionId: fixture.sessionId,
      marker,
      store: evidence,
    });
    assert.equal(duplicate.ok && duplicate.disposition, "existing");
    markerReplay = "existing";
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
  const validationTurns = turns.map((turn) => ({
    eventId: turn.event_id,
    contractVersion: turn.contract_version,
    writerId: turn.writer_id,
    writerGeneration: turn.writer_generation,
    sequence: turn.sequence,
    speaker: turn.speaker,
    text: turn.text,
    startedAt: new Date(turn.started_at),
    endedAt: new Date(turn.ended_at),
    audioMs: turn.audio_duration_ms,
    section: turn.section,
    deliveryState: turn.delivery_state,
  }));
  const interruptions = [...evidence.markers.values()].map((marker) => ({
    eventId: marker.event_id,
    writerId: marker.writer_id,
    writerGeneration: marker.writer_generation,
    sequence: marker.sequence,
    speaker: marker.speaker,
    occurredAt: new Date(marker.occurred_at),
    reason: marker.reason,
  }));
  const sessionEndAt = new Date(fixture.settlement.settled_at);
  const validation = calculateValidatedSessionFromTurns(validationTurns, {
    interruptions,
    sessionEndAt,
  });
  const committedSequence = evidence.committedSequence();
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt: sessionEndAt,
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
        settledAt: fixture.ingestSettlement ? sessionEndAt : null,
      },
    ],
    baseValidation: validation,
  });

  const ordinaryAnswerBlocks = prepareCandidateAnswerBlockEvidenceFromTurns(
    validationTurns,
    { interruptions, sessionEndAt }
  );
  const trustedAnswerBlocks =
    snapshot.state === "partial"
      ? prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot({
          snapshotValid: true,
          snapshotState: "partial",
          turns: validationTurns,
          interruptions,
          sessionEndAt,
          sourceOverflow: false,
          authority: {
            contractVersion: FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
            snapshotState: "partial",
            cutoffAtMs: sessionEndAt.getTime(),
            writers: snapshot.writers.map((writer) => ({
              contractVersion: 1 as const,
              writerId: writer.writerId,
              writerGeneration: writer.writerGeneration,
              committedSequence: writer.committedSequence,
              integrityState: writer.integrityState,
              settlementState: writer.settlementState,
            })),
          },
        })
      : null;
  const answerBlockEvidence = trustedAnswerBlocks ?? ordinaryAnswerBlocks;
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

  if (outcomeReason) {
    const skippedLifecycle = buildSkippedFeedbackLifecycleResponse(
      appliedCompletion.feedback
    );
    assert.ok(skippedLifecycle, "synthetic_skipped_lifecycle_invalid");
    const lifecycle = decodeClosedLifecycle(skippedLifecycle);
    stages.push("api_view_model");
    return {
      lifecycle,
      executionMode: evaluator.executionMode,
      stages,
      durableStepRoundTrips,
      replay: {
        writerRegistration: "existing",
        transcriptEvent: transcriptReplay,
        interruptionMarker: markerReplay,
        interviewEnd: "existing",
        dispatch: "not_required",
        generation: "not_required",
        lateFailureApplied: "not_required",
        persistenceWrites: 0,
      },
    };
  }

  const sent: Array<Parameters<DispatchFeedbackGenerationDeps["send"]>[0]> = [];
  const insightsEvents: Array<
    Parameters<FeedbackGenerationSteps["sendInsights"]>[0]
  > = [];
  const dispatchDeps = createDispatchDeps(
    generationStore,
    sent,
    durableStepRoundTrips
  );
  const dispatched = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      tier: snapshot.validation.tier,
    },
    dispatchDeps
  );
  assert.equal(dispatched.ok && dispatched.disposition, "sent");
  const duplicateDispatch = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      tier: snapshot.validation.tier,
    },
    dispatchDeps
  );
  assert.equal(
    duplicateDispatch.ok && duplicateDispatch.disposition,
    "already_sent"
  );
  assert.equal(sent.length, 1);
  stages.push("durable_dispatch");

  const steps: FeedbackGenerationSteps = {
    async run(name, work) {
      const value = await work();
      durableStepRoundTrips.push(name);
      return jsonRoundTrip(value, name);
    },
    async sleep(name, durationMs) {
      jsonRoundTrip({ name, durationMs }, name);
      durableStepRoundTrips.push(name);
    },
    async sendInsights(event) {
      insightsEvents.push(
        roundTripDurableEvent(
          event,
          "trigger-insights-update",
          durableStepRoundTrips
        )
      );
    },
  };
  const handlerDeps: FeedbackGenerationRequestedHandlerDeps = {
    now: () => SYNTHETIC_NOW.getTime(),
    createWorkflowDeps: (handlerSteps) =>
      createGenerationDeps({
        fixture,
        store: generationStore,
        steps: handlerSteps,
        answerBlocks: answerBlockEvidence.blocks,
        snapshotState: snapshot.state === "complete" ? "complete" : "partial",
        trustedProjection: trustedAnswerBlocks?.projection,
        evaluatorCoverage: options.evaluatorCoverage ?? "complete",
        evaluator,
        stages,
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
  assert.equal(insightsEvents.length, 1);
  stages.push("immutable_persistence", "inngest_handler");
  const duplicateRun = await runFeedbackGenerationRequested({
    eventId,
    data: { sessionId: fixture.sessionId, userId: fixture.userId },
    steps,
    deps: handlerDeps,
  });
  assert.equal(duplicateRun.disposition, "already_terminal");
  assert.equal(generationStore.completeCount, 1);
  assert.equal(insightsEvents.length, 1);

  const lateFailureApplied = await failFeedbackGenerationWorkflow(
    {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      eventId,
      reason: "late_synthetic_failure",
    },
    {
      store: generationStore,
      getSession: async () => ({
        userId: fixture.userId,
        roundType: fixture.roundType,
      }),
      isDeletionPending: async () => false,
    }
  );
  assert.equal(lateFailureApplied, false);

  const persisted = mutatePersistedResult(
    generationStore.persisted!,
    options.persistedResultMutation
  );
  const lifecycle = decodeClosedLifecycle(
    buildCompletedFeedbackLifecycleResponse(
      {
        id: `feedback:${fixture.id}`,
        sessionId: fixture.sessionId,
        ...persisted,
        createdAt: SYNTHETIC_NOW.toISOString(),
      },
      turns
        .filter((turn) => turn.speaker === "user")
        .map((turn) => ({
          eventId: turn.event_id,
          speaker: turn.speaker,
          text: turn.text,
          contractVersion: turn.contract_version,
        })),
      answerBlockEvidence.blocks,
      fixture.roundType,
      snapshot.state === "complete" ? "complete" : "partial",
      undefined,
      trustedAnswerBlocks?.projection
    )
  );
  stages.push("api_view_model");
  return {
    lifecycle,
    executionMode: evaluator.executionMode,
    stages,
    durableStepRoundTrips,
    replay: {
      writerRegistration: "existing",
      transcriptEvent: transcriptReplay,
      interruptionMarker: markerReplay,
      interviewEnd: "existing",
      dispatch: "already_sent",
      generation: "already_terminal",
      lateFailureApplied: false,
      persistenceWrites: 1,
    },
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
      endingAt: SYNTHETIC_NOW,
      endedAt: SYNTHETIC_NOW,
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
      createdAt: SYNTHETIC_NOW,
      status: outcomeReason ? "skipped" : "pending",
      statusReason: outcomeReason,
      outcomeReason,
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
      feedbackMode: null,
      feedbackRoundType: null,
      dimensionCoverage: null,
      verifiedPrefixScope: null,
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
  answerBlocks: CandidateAnswerBlock[];
  snapshotState: "complete" | "partial";
  trustedProjection?: TrustedAnswerBlockProjection;
  evaluatorCoverage: SyntheticFeedbackEvaluationCoverage;
  evaluator: SyntheticFeedbackEvaluatorAdapter;
  stages: FeedbackProductionScenarioStage[];
}): GenerateFeedbackWorkflowDeps {
  return {
    store: input.store,
    steps: input.steps,
    now: () => SYNTHETIC_NOW,
    reportAttempt: () => undefined,
    runtimeMetadata: { environmentClass: "test", release: null },
    isDeletionPending: async () => false,
    getSession: async () => ({
      userId: input.fixture.userId,
      roundType: input.fixture.roundType,
      endingAtMs: SYNTHETIC_NOW.getTime() - 1_000,
    }),
    validateLegacy: async () => {
      throw new Error("synthetic_scenario_never_uses_legacy_validation");
    },
    getAnswerBlockEvidence: async () => ({
      blocks: input.answerBlocks,
      eligible: input.answerBlocks.length > 0,
      evidenceFailureReason:
        input.answerBlocks.length > 0 ? null : "no_reviewable_answer",
      snapshotState: input.snapshotState,
      ...(input.trustedProjection
        ? { trustedProjection: input.trustedProjection }
        : {}),
    }),
    evaluate: async ({
      roundType,
      answerBlocks,
      allowNumericalScores,
      verifiedPrefixProjection,
    }) => {
      input.stages.push("evaluator");
      return input.evaluator.evaluate({
        roundType,
        answerBlocks,
        allowNumericalScores,
        ...(verifiedPrefixProjection ? { verifiedPrefixProjection } : {}),
        coverage: input.evaluatorCoverage,
      });
    },
  };
}

function dimensionCoverageEvaluation(
  input: SyntheticFeedbackEvaluationInput
): FeedbackEvaluationResult {
  const answerBlockRef = input.answerBlocks[0]?.answerBlockId;
  assert.ok(answerBlockRef);
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount = input.coverage === "complete" ? 2 : 1;
    dimensions[dimension] = {
      score:
        input.allowNumericalScores && facetCount === 2
          ? syntheticScore(dimension)
          : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG[input.roundType][
        dimension
      ].facets
        .slice(0, facetCount)
        .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return parseDimensionCoverageProviderSelection(
    {
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      roundType: input.roundType,
      dimensions,
    },
    {
      roundType: input.roundType,
      answerBlocks: input.answerBlocks,
      modelVersion: "synthetic-provider-free-evaluator-v1",
      allowNumericalScores: input.allowNumericalScores,
      ...(input.verifiedPrefixProjection
        ? { verifiedPrefixProjection: input.verifiedPrefixProjection }
        : {}),
    }
  );
}

function syntheticScore(dimension: (typeof FEEDBACK_DIMENSIONS)[number]) {
  return {
    structure: 8,
    clarity: 7,
    insight: 8,
    communication: 7,
    leadership: 8,
  }[dimension];
}

function mutatePersistedResult(
  persisted: Omit<PersistedCompletedFeedback, "id" | "sessionId" | "createdAt">,
  mutation: FeedbackProductionScenarioOptions["persistedResultMutation"]
) {
  if (mutation === "unknown_schema_version") {
    return { ...persisted, schemaVersion: "feedback.unknown.v999" };
  }
  return persisted;
}

function decodeClosedLifecycle(value: unknown): FeedbackLifecycleResponse {
  const roundTripped = jsonRoundTrip(value, "customer-lifecycle");
  const decoded = decodeFeedbackLifecycleResponse(roundTripped);
  assert.ok(decoded, "synthetic_feedback_lifecycle_decode_failed");
  return decoded;
}

function jsonRoundTrip<T>(value: T, stepName: string): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`synthetic_durable_step_not_json:${stepName}`);
  }
  return JSON.parse(serialized) as T;
}

function roundTripDurableEvent<T>(
  value: T,
  stepName: string,
  durableStepRoundTrips: string[]
): T {
  const roundTripped = jsonRoundTrip(value, stepName);
  durableStepRoundTrips.push(stepName);
  return roundTripped;
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
        lifecycleState: "active",
        lifecycleVersion: 1,
      };
    }
    this.writer = registration;
    return {
      ok: true as const,
      disposition: "created" as const,
      writer: registration,
      writerGeneration: 1,
      lifecycleState: "active",
      lifecycleVersion: 1,
    };
  }

  async persist(input: {
    principal:
      | { kind: "voice_runtime" }
      | { kind: "authenticated_user"; userId: string };
    event: TranscriptEvent;
  }): Promise<PersistTranscriptEventResult<TranscriptEvent>>;
  async persist(
    input: TranscriptInterruptionMarker
  ): Promise<
    PersistTranscriptInterruptionMarkerResult<TranscriptInterruptionMarker>
  >;
  async persist(
    input: TranscriptRuntimeSettlement
  ): Promise<
    PersistTranscriptRuntimeSettlementResult<TranscriptRuntimeSettlement>
  >;
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
  ): Promise<
    | PersistTranscriptEventResult<TranscriptEvent>
    | PersistTranscriptInterruptionMarkerResult<TranscriptInterruptionMarker>
    | PersistTranscriptRuntimeSettlementResult<TranscriptRuntimeSettlement>
  > {
    if ("event" in input) return this.persistTurn(input.event);
    if (input.event_type === "integrity_unavailable") {
      return this.persistMarker(input);
    }
    if (this.settlement) {
      return {
        ok: true,
        disposition: "existing",
        settlement: this.settlement,
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
    if (isDimensionCoverageFeedbackResult(input.evaluation)) {
      this.persisted = {
        structureScore: input.evaluation.dimensions.structure.score,
        clarityScore: input.evaluation.dimensions.clarity.score,
        insightScore: input.evaluation.dimensions.insight.score,
        communicationScore: input.evaluation.dimensions.communication.score,
        leadershipScore: input.evaluation.dimensions.leadership.score,
        overallScore:
          input.evaluation.overallScore === null
            ? null
            : input.evaluation.overallScore.toString(),
        strengths: null,
        improvements: null,
        drills: [],
        summary: input.evaluation.summary,
        rubricVersion: input.evaluation.rubricVersion,
        schemaVersion: input.evaluation.schemaVersion,
        promptVersion: input.evaluation.promptVersion,
        modelVersion: input.evaluation.modelVersion,
        evaluationState: input.evaluation.evaluationState,
        feedbackMode: input.evaluation.mode,
        feedbackRoundType: input.evaluation.roundType,
        dimensionCoverage: input.evaluation.dimensions,
        verifiedPrefixScope:
          "verifiedPrefixScope" in input.evaluation
            ? input.evaluation.verifiedPrefixScope
            : null,
      };
    } else if (
      "strengths" in input.evaluation &&
      !("scores" in input.evaluation)
    ) {
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
        feedbackMode: null,
        feedbackRoundType: null,
        dimensionCoverage: null,
        verifiedPrefixScope: null,
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
        feedbackMode: null,
        feedbackRoundType: null,
        dimensionCoverage: null,
        verifiedPrefixScope: null,
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
  sent: Array<Parameters<DispatchFeedbackGenerationDeps["send"]>[0]>,
  durableStepRoundTrips: string[]
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
    now: () => SYNTHETIC_NOW,
    reportFailure() {},
    async send(event) {
      sent.push(
        roundTripDurableEvent(
          event,
          "dispatch-feedback-generation-event",
          durableStepRoundTrips
        )
      );
    },
  };
}

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  parseFeedbackV2,
  prepareFeedbackTranscript,
  type FeedbackDimension,
  type FeedbackEvaluationState,
  type FeedbackV2Result,
  type FeedbackV2Scores,
} from "@meelni/core";
import {
  CALIBRATION_ROUND_TYPES,
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_CALIBRATION_THRESHOLDS,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
  type CalibrationCompletionState,
  type CalibrationQuality,
  type EvaluationCalibrationCase,
} from "@meelni/test-fixtures";

import type {
  FeedbackGenerationRecord,
  FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import {
  calculateValidatedSessionFromTurns,
  SessionTier,
} from "@/lib/evaluation/session-validator";
import {
  generateFeedbackWorkflow,
  type GenerateFeedbackWorkflowDeps,
} from "@/lib/workflows/generate-feedback";

export type CalibrationExecutionKind =
  | "preflight"
  | "deterministic_self_test"
  | "live_provider";

export interface CalibrationEvaluatorInput {
  fixture: EvaluationCalibrationCase;
  evaluationState: FeedbackEvaluationState;
  runIndex: number;
}

export type CalibrationEvaluator = (
  input: CalibrationEvaluatorInput
) => Promise<FeedbackV2Result>;

export interface CalibrationRunOptions {
  executionKind: CalibrationExecutionKind;
  evaluator?: CalibrationEvaluator;
  modelVersion: string | null;
  repetitions?: number;
  now?: Date;
}

export interface CalibrationFailure {
  caseId: string;
  code: string;
  runIndex?: number;
  dimension?: FeedbackDimension;
  actualScore?: number;
  expectedMinimum?: number;
  expectedMaximum?: number;
  observedScoreRange?: number;
  observedModelVersion?: string;
  expectedModelVersion?: string;
}

export interface EvaluationCalibrationReport {
  contractVersion: "evaluation-calibration-report.v2";
  generatedAt: string;
  execution: {
    kind: CalibrationExecutionKind;
    modelVersion: string | null;
    repetitions: number;
    customerDataUsed: false;
    paidProviderCalled: boolean;
    modelVersionBasis:
      | "not_applicable"
      | "deterministic_identifier"
      | "configured_provider_model";
    observedModelVersions: string[];
  };
  versions: {
    goldSet: typeof EVALUATION_GOLD_SET_VERSION;
    adjudication: typeof EVALUATION_ADJUDICATION_VERSION;
    schema: typeof FEEDBACK_SCHEMA_VERSION;
    prompt: typeof FEEDBACK_PROMPT_VERSION;
    rubric: typeof FEEDBACK_RUBRIC_VERSION;
  };
  corpus: {
    totalCases: number;
    scoredCases: number;
    insufficientCases: number;
    casesByRound: Record<string, number>;
    scoredCasesByQuality: Record<CalibrationQuality, number>;
    pendingAdjudicationSignoffs: number;
    expectedStateMismatches: number;
    invalidEvidenceAnchors: number;
  };
  metrics: {
    evidenceValidityRate: number | null;
    adjudicatedEvidenceMatchRate: number | null;
    insufficientHandlingRate: number;
    scoreBandAgreementRate: number | null;
    scoreBandAgreementByDimension: Record<FeedbackDimension, number | null>;
    scoreBandAgreementByRound: Record<string, number | null>;
    scoreBandAgreementByState: Record<
      Exclude<CalibrationCompletionState, "insufficient">,
      number | null
    >;
    maximumRepeatedRunScoreRange: number | null;
    modelVersionMatchRate: number | null;
    evaluatorCalls: number;
    providerEvaluationCalls: number;
  };
  thresholds: typeof EVALUATION_CALIBRATION_THRESHOLDS;
  gate: {
    deterministicHarness: "passed" | "failed" | "not_run";
    adjudicationAcceptance: "passed" | "pending_product_owner_pm_signoff";
    liveProviderAcceptance: "passed" | "failed" | "pending";
    launchAcceptance:
      | "passed"
      | "failed"
      | "pending_live_provider_run"
      | "pending_adjudication_signoff";
  };
  failures: CalibrationFailure[];
  blockers: string[];
}

const DIMENSIONS: readonly FeedbackDimension[] = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
];

export function validateCalibrationRunBudget(
  repetitions: number,
  scoredCaseCount = evaluationCalibrationCases.filter(
    (fixture) => fixture.expectedCompletionState !== "insufficient"
  ).length
): number {
  const { minimumProviderRuns, maximumProviderRuns, maximumProviderCalls } =
    EVALUATION_CALIBRATION_THRESHOLDS;
  if (
    !Number.isInteger(repetitions) ||
    repetitions < minimumProviderRuns ||
    repetitions > maximumProviderRuns
  ) {
    throw new Error(
      `Calibration repetitions must be exactly ${minimumProviderRuns}; supported range is ${minimumProviderRuns}-${maximumProviderRuns}`
    );
  }
  const providerCallBudget = scoredCaseCount * repetitions;
  if (providerCallBudget > maximumProviderCalls) {
    throw new Error(
      `Calibration would require ${providerCallBudget} provider calls, above the ${maximumProviderCalls}-call cap`
    );
  }
  return providerCallBudget;
}

export async function runEvaluationCalibration(
  options: CalibrationRunOptions
): Promise<EvaluationCalibrationReport> {
  const now = options.now ?? new Date();
  const repetitions =
    options.executionKind === "preflight"
      ? 0
      : (options.repetitions ??
        EVALUATION_CALIBRATION_THRESHOLDS.minimumProviderRuns);
  const failures: CalibrationFailure[] = [];
  let invalidEvidenceAnchors = 0;

  for (const fixture of evaluationCalibrationCases) {
    const validation = calculateValidatedSessionFromTurns(fixture.transcript);
    const actualState = calibrationState(validation.tier);
    if (actualState !== fixture.expectedCompletionState) {
      failures.push({ caseId: fixture.id, code: "expected_state_mismatch" });
    }
    const byId = new Map(
      fixture.transcript.map((turn) => [turn.eventId, turn] as const)
    );
    for (const anchor of fixture.evidenceAnchors) {
      const turn = byId.get(anchor.turnRef);
      if (
        !turn ||
        turn.speaker !== "user" ||
        !turn.text.includes(anchor.quote)
      ) {
        invalidEvidenceAnchors += 1;
        failures.push({
          caseId: fixture.id,
          code: "invalid_gold_evidence_anchor",
        });
      }
    }
  }

  const scoredCases = evaluationCalibrationCases.filter(
    (fixture) => fixture.expectedCompletionState !== "insufficient"
  );
  const insufficientCases = evaluationCalibrationCases.filter(
    (fixture) => fixture.expectedCompletionState === "insufficient"
  );
  if (options.executionKind !== "preflight") {
    validateCalibrationRunBudget(repetitions, scoredCases.length);
  }
  let insufficientHandled = 0;
  let evaluatorCalls = 0;
  const outputs = new Map<
    string,
    Array<{ runIndex: number; evaluation: FeedbackV2Result }>
  >();
  const observedModelVersions = new Set<string>();

  for (const fixture of insufficientCases) {
    let evaluatorCalls = 0;
    const result = await runCaseThroughGenerationWorkflow({
      fixture,
      runIndex: 0,
      evaluationState: null,
      evaluator: async () => {
        evaluatorCalls += 1;
        throw new Error("insufficient_case_reached_evaluator");
      },
      now,
    });
    if (result.status === "skipped" && evaluatorCalls === 0) {
      insufficientHandled += 1;
    } else {
      failures.push({ caseId: fixture.id, code: "insufficient_not_skipped" });
    }
  }

  if (options.executionKind !== "preflight") {
    if (!options.evaluator || !options.modelVersion?.trim()) {
      throw new Error(
        "Calibration execution requires an evaluator and modelVersion"
      );
    }
    for (const fixture of scoredCases) {
      const expectedState =
        fixture.expectedCompletionState as FeedbackEvaluationState;
      const caseOutputs: Array<{
        runIndex: number;
        evaluation: FeedbackV2Result;
      }> = [];
      for (let runIndex = 0; runIndex < repetitions; runIndex += 1) {
        try {
          const result = await runCaseThroughGenerationWorkflow({
            fixture,
            runIndex,
            evaluationState: expectedState,
            now,
            evaluator: async (input) => {
              evaluatorCalls += 1;
              return options.evaluator!(input);
            },
          });
          if (result.status !== "completed" || !result.evaluation) {
            failures.push({
              caseId: fixture.id,
              runIndex,
              code: "workflow_did_not_complete",
            });
            continue;
          }
          caseOutputs.push({ runIndex, evaluation: result.evaluation });
        } catch {
          failures.push({
            caseId: fixture.id,
            runIndex,
            code: "evaluation_failed",
          });
        }
      }
      outputs.set(fixture.id, caseOutputs);
    }
  }

  const expectedOutputs = scoredCases.length * repetitions;
  let validEvidenceOutputs = 0;
  let matchedEvidenceOutputs = 0;
  let scoresInsideBand = 0;
  let matchingModelVersions = 0;
  const expectedScoreComparisons = expectedOutputs * DIMENSIONS.length;
  const dimensionMatches = new Map<FeedbackDimension, number>();
  const roundMatches = new Map<string, number>();
  const stateMatches = new Map<"full" | "partial", number>();
  let maximumRepeatedRunScoreRange = 0;

  for (const fixture of scoredCases) {
    const caseOutputs = outputs.get(fixture.id) ?? [];
    for (const { runIndex, evaluation: output } of caseOutputs) {
      observedModelVersions.add(output.modelVersion);
      if (output.modelVersion === options.modelVersion) {
        matchingModelVersions += 1;
      } else {
        failures.push({
          caseId: fixture.id,
          runIndex,
          code: "model_version_mismatch",
          observedModelVersion: output.modelVersion,
          expectedModelVersion: options.modelVersion ?? undefined,
        });
      }
      try {
        const reparsed = reparseEvaluation(output, fixture);
        validEvidenceOutputs += 1;
        if (matchesAdjudicatedEvidence(reparsed, fixture)) {
          matchedEvidenceOutputs += 1;
        } else {
          failures.push({
            caseId: fixture.id,
            runIndex,
            code: "adjudicated_evidence_not_matched",
          });
        }
        for (const dimension of DIMENSIONS) {
          const band = fixture.scoreBands![dimension];
          const score = reparsed.scores[dimension];
          if (score >= band.minimum && score <= band.maximum) {
            scoresInsideBand += 1;
            increment(dimensionMatches, dimension);
            increment(roundMatches, fixture.roundType);
            increment(
              stateMatches,
              fixture.expectedCompletionState as "full" | "partial"
            );
          } else {
            failures.push({
              caseId: fixture.id,
              runIndex,
              dimension,
              code: "score_outside_adjudicated_band",
              actualScore: score,
              expectedMinimum: band.minimum,
              expectedMaximum: band.maximum,
            });
          }
        }
      } catch {
        failures.push({
          caseId: fixture.id,
          runIndex,
          code: "invalid_feedback_evidence",
        });
      }
    }

    if (caseOutputs.length !== repetitions && repetitions > 0) {
      maximumRepeatedRunScoreRange = Number.POSITIVE_INFINITY;
      continue;
    }
    for (const dimension of DIMENSIONS) {
      const values = caseOutputs.map(({ runIndex, evaluation }) => ({
        runIndex,
        score: evaluation.scores[dimension],
      }));
      if (values.length > 1) {
        const scores = values.map(({ score }) => score);
        const scoreRange = Math.max(...scores) - Math.min(...scores);
        maximumRepeatedRunScoreRange = Math.max(
          maximumRepeatedRunScoreRange,
          scoreRange
        );
        if (
          scoreRange >
          EVALUATION_CALIBRATION_THRESHOLDS.maximumRepeatedRunScoreRange
        ) {
          values.forEach(({ score: actualScore, runIndex }) => {
            failures.push({
              caseId: fixture.id,
              runIndex,
              dimension,
              code: "unstable_dimension_score",
              actualScore,
              observedScoreRange: scoreRange,
            });
          });
        }
      }
    }
  }

  const metrics = {
    evidenceValidityRate:
      expectedOutputs === 0 ? null : validEvidenceOutputs / expectedOutputs,
    adjudicatedEvidenceMatchRate:
      expectedOutputs === 0 ? null : matchedEvidenceOutputs / expectedOutputs,
    insufficientHandlingRate:
      insufficientCases.length === 0
        ? 0
        : insufficientHandled / insufficientCases.length,
    scoreBandAgreementRate:
      expectedScoreComparisons === 0
        ? null
        : scoresInsideBand / expectedScoreComparisons,
    scoreBandAgreementByDimension: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        rate(
          dimensionMatches.get(dimension) ?? 0,
          scoredCases.length * repetitions
        ),
      ])
    ) as Record<FeedbackDimension, number | null>,
    scoreBandAgreementByRound: Object.fromEntries(
      CALIBRATION_ROUND_TYPES.map((roundType) => [
        roundType,
        rate(
          roundMatches.get(roundType) ?? 0,
          scoredCases.filter((fixture) => fixture.roundType === roundType)
            .length *
            repetitions *
            DIMENSIONS.length
        ),
      ])
    ),
    scoreBandAgreementByState: Object.fromEntries(
      (["full", "partial"] as const).map((state) => [
        state,
        rate(
          stateMatches.get(state) ?? 0,
          scoredCases.filter(
            (fixture) => fixture.expectedCompletionState === state
          ).length *
            repetitions *
            DIMENSIONS.length
        ),
      ])
    ) as Record<"full" | "partial", number | null>,
    maximumRepeatedRunScoreRange:
      repetitions === 0 ? null : finiteOrNull(maximumRepeatedRunScoreRange),
    modelVersionMatchRate:
      expectedOutputs === 0 ? null : matchingModelVersions / expectedOutputs,
    evaluatorCalls,
    providerEvaluationCalls:
      options.executionKind === "live_provider" ? evaluatorCalls : 0,
  };
  const corpusPassed =
    failures.every((failure) => failure.code !== "expected_state_mismatch") &&
    invalidEvidenceAnchors === 0 &&
    metrics.insufficientHandlingRate ===
      EVALUATION_CALIBRATION_THRESHOLDS.insufficientHandlingRate;
  const evaluatedThresholdsPassed =
    metrics.evidenceValidityRate ===
      EVALUATION_CALIBRATION_THRESHOLDS.evidenceValidityRate &&
    metrics.adjudicatedEvidenceMatchRate === 1 &&
    metrics.scoreBandAgreementRate !== null &&
    metrics.scoreBandAgreementRate >=
      EVALUATION_CALIBRATION_THRESHOLDS.scoreBandAgreementRate &&
    everyRateAtLeast(
      metrics.scoreBandAgreementByDimension,
      EVALUATION_CALIBRATION_THRESHOLDS.minimumDimensionScoreBandAgreementRate
    ) &&
    everyRateAtLeast(
      metrics.scoreBandAgreementByRound,
      EVALUATION_CALIBRATION_THRESHOLDS.minimumRoundScoreBandAgreementRate
    ) &&
    everyRateAtLeast(
      metrics.scoreBandAgreementByState,
      EVALUATION_CALIBRATION_THRESHOLDS.minimumStateScoreBandAgreementRate
    ) &&
    metrics.maximumRepeatedRunScoreRange !== null &&
    metrics.maximumRepeatedRunScoreRange <=
      EVALUATION_CALIBRATION_THRESHOLDS.maximumRepeatedRunScoreRange &&
    metrics.modelVersionMatchRate ===
      EVALUATION_CALIBRATION_THRESHOLDS.modelVersionMatchRate;
  const executionPassed = corpusPassed && evaluatedThresholdsPassed;
  const liveProvider = options.executionKind === "live_provider";
  const pendingAdjudicationSignoffs = evaluationCalibrationCases.filter(
    ({ adjudicationSignoff }) =>
      adjudicationSignoff !== "product_owner_pm_approved"
  ).length;
  const adjudicationPassed = pendingAdjudicationSignoffs === 0;

  return {
    contractVersion: "evaluation-calibration-report.v2",
    generatedAt: now.toISOString(),
    execution: {
      kind: options.executionKind,
      modelVersion: options.modelVersion,
      repetitions,
      customerDataUsed: false,
      paidProviderCalled: liveProvider && evaluatorCalls > 0,
      modelVersionBasis:
        options.executionKind === "preflight"
          ? "not_applicable"
          : liveProvider
            ? "configured_provider_model"
            : "deterministic_identifier",
      observedModelVersions: [...observedModelVersions].sort(),
    },
    versions: {
      goldSet: EVALUATION_GOLD_SET_VERSION,
      adjudication: EVALUATION_ADJUDICATION_VERSION,
      schema: FEEDBACK_SCHEMA_VERSION,
      prompt: FEEDBACK_PROMPT_VERSION,
      rubric: FEEDBACK_RUBRIC_VERSION,
    },
    corpus: {
      totalCases: evaluationCalibrationCases.length,
      scoredCases: scoredCases.length,
      insufficientCases: insufficientCases.length,
      casesByRound: Object.fromEntries(
        evaluationCalibrationCases.map(({ roundType }) => [
          roundType,
          evaluationCalibrationCases.filter(
            (entry) => entry.roundType === roundType
          ).length,
        ])
      ),
      scoredCasesByQuality: Object.fromEntries(
        (["weak", "average", "strong"] as const).map((quality) => [
          quality,
          scoredCases.filter((fixture) => fixture.expectedQuality === quality)
            .length,
        ])
      ) as Record<CalibrationQuality, number>,
      pendingAdjudicationSignoffs,
      expectedStateMismatches: failures.filter(
        ({ code }) => code === "expected_state_mismatch"
      ).length,
      invalidEvidenceAnchors,
    },
    metrics,
    thresholds: EVALUATION_CALIBRATION_THRESHOLDS,
    gate: {
      deterministicHarness:
        options.executionKind === "deterministic_self_test"
          ? executionPassed
            ? "passed"
            : "failed"
          : "not_run",
      adjudicationAcceptance: adjudicationPassed
        ? "passed"
        : "pending_product_owner_pm_signoff",
      liveProviderAcceptance: liveProvider
        ? executionPassed
          ? "passed"
          : "failed"
        : "pending",
      launchAcceptance:
        liveProvider && !executionPassed
          ? "failed"
          : !adjudicationPassed
            ? "pending_adjudication_signoff"
            : liveProvider
              ? "passed"
              : "pending_live_provider_run",
    },
    failures,
    blockers: [
      ...(!adjudicationPassed
        ? [
            "The agent-authored synthetic adjudication candidates require product-owner/PM review and signoff. Model runs cannot satisfy this gate.",
          ]
        : []),
      ...(liveProvider
        ? executionPassed
          ? []
          : [
              "The live provider calibration did not meet every acceptance threshold.",
            ]
        : [
            "No authorized live provider calibration has been run. Deterministic evidence proves only the harness and candidate-set contract.",
          ]),
    ],
  };
}

export function createDeterministicCalibrationEvaluator(
  modelVersion = "deterministic-calibration-self-test.v1"
): CalibrationEvaluator {
  return async ({ fixture, evaluationState }) => {
    if (!fixture.scoreBands || fixture.evidenceAnchors.length < 2) {
      throw new Error("Deterministic evaluator received an insufficient case");
    }
    const midpoint = (dimension: FeedbackDimension) => {
      const band = fixture.scoreBands![dimension];
      return Math.round((band.minimum + band.maximum) / 2);
    };
    const scores: FeedbackV2Scores = {
      structure: midpoint("structure"),
      clarity: midpoint("clarity"),
      insight: midpoint("insight"),
      communication: midpoint("communication"),
      leadership: midpoint("leadership"),
    };
    const strength = fixture.evidenceAnchors.find(
      (anchor) => anchor.kind === "strength"
    )!;
    const improvement = fixture.evidenceAnchors.find(
      (anchor) => anchor.kind === "improvement"
    )!;
    return parseFeedbackV2(
      {
        schemaVersion: FEEDBACK_SCHEMA_VERSION,
        promptVersion: FEEDBACK_PROMPT_VERSION,
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        evaluationState,
        scores,
        strengths: [fixtureItem(strength)],
        improvements: [fixtureItem(improvement)],
        drills: [
          "Practice one answer with an explicit decision and guardrail.",
        ],
        summary:
          "Deterministic harness output for a fully synthetic PM transcript.",
      },
      {
        transcript: fixture.transcript,
        evaluationState,
        modelVersion,
      }
    );
  };
}

async function runCaseThroughGenerationWorkflow(input: {
  fixture: EvaluationCalibrationCase;
  runIndex: number;
  evaluationState: FeedbackEvaluationState | null;
  evaluator: CalibrationEvaluator;
  now: Date;
}): Promise<{
  status: string;
  evaluation: FeedbackV2Result | null;
}> {
  const eventId = `calibration:${input.fixture.id}:${input.runIndex}`;
  const completionTier = input.fixture.expectedCompletionState;
  const store = new CalibrationGenerationStore({
    sessionId: input.fixture.id,
    status: "pending",
    statusReason: null,
    eventId,
    processingStartedAt: null,
    completionTier,
    dispatchStatus: "sent",
    dispatchClaimedAt: input.now,
    dispatchedAt: input.now,
  });
  const prepared = prepareFeedbackTranscript(input.fixture.transcript, {
    requireContractV2: true,
  });
  const deps: GenerateFeedbackWorkflowDeps = {
    store,
    now: () => input.now,
    steps: {
      run: (_name, work) => work(),
      sendInsights: async () => undefined,
    },
    getSession: async () => ({
      userId: "synthetic-calibration-user",
      roundType: input.fixture.roundType,
    }),
    validateLegacy: async () => {
      throw new Error("calibration_never_uses_legacy_validation");
    },
    getTranscript: async () => prepared,
    evaluate: async ({ evaluationState }) => {
      if (!input.evaluationState || evaluationState !== input.evaluationState) {
        throw new Error("calibration_evaluation_state_mismatch");
      }
      return input.evaluator({
        fixture: input.fixture,
        evaluationState,
        runIndex: input.runIndex,
      });
    },
  };
  const result = await generateFeedbackWorkflow(
    {
      sessionId: input.fixture.id,
      userId: "synthetic-calibration-user",
      eventId,
    },
    deps
  );
  return { status: result.status, evaluation: store.completedEvaluation };
}

class CalibrationGenerationStore implements FeedbackGenerationStore {
  public completedEvaluation: FeedbackV2Result | null = null;

  constructor(private current: FeedbackGenerationRecord) {}

  async get(): Promise<FeedbackGenerationRecord> {
    return { ...this.current };
  }

  async claim(input: {
    sessionId: string;
    eventId: string;
    now: Date;
  }): Promise<FeedbackGenerationRecord | null> {
    if (
      this.current.sessionId !== input.sessionId ||
      this.current.eventId !== input.eventId ||
      !["pending", "failed"].includes(this.current.status)
    ) {
      return null;
    }
    this.current = {
      ...this.current,
      status: "processing",
      processingStartedAt: input.now,
    };
    return { ...this.current };
  }

  async complete(input: {
    sessionId: string;
    eventId: string;
    evaluation: FeedbackV2Result;
  }): Promise<boolean> {
    if (!this.ownsActiveClaim(input)) return false;
    this.completedEvaluation = input.evaluation;
    this.current = { ...this.current, status: "completed" };
    return true;
  }

  async skip(input: {
    sessionId: string;
    eventId: string;
    reason: string;
    completionTier?: "insufficient";
  }): Promise<boolean> {
    if (!this.ownsActiveClaim(input)) return false;
    this.current = {
      ...this.current,
      status: "skipped",
      statusReason: input.reason,
      completionTier: input.completionTier ?? this.current.completionTier,
    };
    return true;
  }

  async fail(input: {
    sessionId: string;
    eventId: string;
    reason: string;
  }): Promise<boolean> {
    if (!this.ownsActiveClaim(input)) return false;
    this.current = {
      ...this.current,
      status: "failed",
      statusReason: input.reason,
    };
    return true;
  }

  async prepareRetry() {
    return { prepared: false, record: { ...this.current } };
  }

  private ownsActiveClaim(input: { sessionId: string; eventId: string }) {
    return (
      this.current.sessionId === input.sessionId &&
      this.current.eventId === input.eventId &&
      this.current.status === "processing"
    );
  }
}

function calibrationState(tier: SessionTier): CalibrationCompletionState {
  if (tier === SessionTier.FULL) return "full";
  if (tier === SessionTier.PARTIAL) return "partial";
  return "insufficient";
}

function fixtureItem(
  anchor: EvaluationCalibrationCase["evidenceAnchors"][number]
) {
  return {
    dimension: anchor.dimension,
    observation: anchor.observation,
    transcriptRefs: [anchor.turnRef],
    evidence: [{ turnRef: anchor.turnRef, quote: anchor.quote }],
    nextStep: anchor.nextStep,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: 0.9,
  };
}

function reparseEvaluation(
  output: FeedbackV2Result,
  fixture: EvaluationCalibrationCase
): FeedbackV2Result {
  return parseFeedbackV2(
    {
      schemaVersion: output.schemaVersion,
      promptVersion: output.promptVersion,
      rubricVersion: output.rubricVersion,
      evaluationState: output.evaluationState,
      scores: output.scores,
      strengths: output.strengths,
      improvements: output.improvements,
      drills: output.drills,
      summary: output.summary,
    },
    {
      transcript: fixture.transcript,
      evaluationState:
        fixture.expectedCompletionState as FeedbackEvaluationState,
      modelVersion: output.modelVersion,
    }
  );
}

function matchesAdjudicatedEvidence(
  output: FeedbackV2Result,
  fixture: EvaluationCalibrationCase
): boolean {
  const items = [
    ...output.strengths.map((item) => ({ ...item, kind: "strength" as const })),
    ...output.improvements.map((item) => ({
      ...item,
      kind: "improvement" as const,
    })),
  ];
  return fixture.evidenceAnchors.every((anchor) =>
    items.some(
      (item) =>
        item.kind === anchor.kind &&
        item.dimension === anchor.dimension &&
        item.evidence.some(
          (evidence) =>
            evidence.turnRef === anchor.turnRef &&
            evidence.quote === anchor.quote
        )
    )
  );
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function increment<Key>(map: Map<Key, number>, key: Key): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function rate(matches: number, total: number): number | null {
  return total === 0 ? null : matches / total;
}

function everyRateAtLeast(
  rates: Record<string, number | null>,
  floor: number
): boolean {
  return Object.values(rates).every(
    (value) => value !== null && value >= floor
  );
}

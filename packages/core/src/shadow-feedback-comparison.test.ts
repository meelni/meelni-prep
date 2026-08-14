import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
  SHADOW_FEEDBACK_COST_RATES_VERSION,
  aggregateShadowFeedbackArtifacts,
  compareShadowFeedbackWithBatch,
  createShadowFeedbackArtifactKey,
  createShadowFeedbackBatchAuthority,
  createShadowFeedbackSchedulingIntents,
  parseShadowFeedbackComparisonReport,
  parseShadowFeedbackSchedulingIntent,
  projectTrustedClosedAnswerBlocks,
  type DimensionCoverageFeedbackResult,
  type FrozenAnswerBlockAuthorityV1,
  type ShadowFeedbackArtifactKeyV1,
  type ShadowFeedbackArtifactSetV1,
  type ShadowFeedbackArtifactV1,
  type TrustedAnswerBlockProjection,
} from "./index";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "../../test-fixtures/src/answer-blocks";

const SESSION_ID = "44700000-0000-4000-8000-000000000447";
const MODEL_VERSION = "synthetic-shadow-model.v1";
const FREEZE_ANCHOR_MS = Date.parse("2026-08-14T10:00:00.000Z");

test("scheduling stays content-free and segmentation-invariant", () => {
  const intents = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const projection = projectionFor(segmentCount);
    const [intent] = createShadowFeedbackSchedulingIntents({
      sessionId: SESSION_ID,
      projection,
      terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      selectionSchemaVersion:
        FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      modelVersion: MODEL_VERSION,
    });
    assert.ok(intent);
    assert.deepEqual(parseShadowFeedbackSchedulingIntent(intent), intent);
    assert.equal(JSON.stringify(intent).includes("candidate response"), false);
    assert.throws(
      () =>
        parseShadowFeedbackSchedulingIntent({
          ...intent,
          transcript: "forbidden",
        }),
      /invalid_shape/
    );
    return intent;
  });
  assert.equal(new Set(intents.map(({ intentId }) => intentId)).size, 1);
});

test("no-trust and integrity failure projections create zero intents", () => {
  const projection = projectionFor(1);
  for (const status of ["no_trusted_blocks", "integrity_failure"] as const) {
    assert.deepEqual(
      createShadowFeedbackSchedulingIntents({
        sessionId: SESSION_ID,
        projection: {
          ...projection,
          status,
          trustedBlocks: [],
          trustedBlockIdentities: [],
          closureAuthorities: [],
          failureReason:
            status === "integrity_failure" ? "authority_malformed" : null,
        },
        terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
        rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
        promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
        selectionSchemaVersion:
          FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
        modelVersion: MODEL_VERSION,
      }),
      []
    );
  }
});

test("artifact sets require exact unique present, missing, and failed partitions", () => {
  const projection = projectionFor(1);
  const keyA = expectedKey(projection);
  const keyB = alternateKey("b");
  const keyC = alternateKey("c");
  const completedA = completedArtifact(keyA);
  const completedB = completedArtifact(keyB);
  const failedB = failedArtifact(keyB, "internal");
  const batch = batchAuthority(projection);

  const validTerminalSet: ShadowFeedbackArtifactSetV1 = {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
    sessionId: SESSION_ID,
    status: "incomplete",
    expectedKeyFingerprints: [keyA.keyFingerprint, keyB.keyFingerprint],
    artifacts: [completedA, failedB],
    missingKeyFingerprints: [],
    failedKeyFingerprints: [keyB.keyFingerprint],
  };
  const validReport = compareShadowFeedbackWithBatch({
    batchAuthority: batch,
    artifactSet: validTerminalSet,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });
  assert.equal(validReport.status, "incomplete");
  assert.equal(validReport.artifacts.failed, 1);
  assert.equal(validReport.failures.internal, 1);

  const adversarialSets: Array<[string, ShadowFeedbackArtifactSetV1]> = [
    [
      "duplicate missing",
      {
        ...validTerminalSet,
        status: "incomplete",
        artifacts: [completedA],
        missingKeyFingerprints: [keyB.keyFingerprint, keyB.keyFingerprint],
        failedKeyFingerprints: [],
      },
    ],
    [
      "duplicate failed",
      {
        ...validTerminalSet,
        failedKeyFingerprints: [keyB.keyFingerprint, keyB.keyFingerprint],
      },
    ],
    [
      "omitted expected",
      {
        ...validTerminalSet,
        status: "incomplete",
        expectedKeyFingerprints: [
          keyA.keyFingerprint,
          keyB.keyFingerprint,
          keyC.keyFingerprint,
        ],
        artifacts: [completedA],
        missingKeyFingerprints: [keyB.keyFingerprint],
        failedKeyFingerprints: [],
      },
    ],
    [
      "failed id points at completed",
      {
        ...validTerminalSet,
        artifacts: [completedA, completedB],
      },
    ],
    [
      "unlisted failed artifact",
      { ...validTerminalSet, failedKeyFingerprints: [] },
    ],
    [
      "complete with missing",
      {
        ...validTerminalSet,
        status: "complete",
        artifacts: [completedA],
        missingKeyFingerprints: [keyB.keyFingerprint],
        failedKeyFingerprints: [],
      },
    ],
    ["complete with failed", { ...validTerminalSet, status: "complete" }],
  ];
  for (const [name, artifactSet] of adversarialSets) {
    assert.equal(
      compareShadowFeedbackWithBatch({
        batchAuthority: batch,
        artifactSet,
        terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
      }).status,
      "invalid",
      name
    );
  }
});

test("aggregate set stays incomplete until every expected artifact succeeds", () => {
  const projection = projectionFor(1);
  const keyA = expectedKey(projection);
  const keyB = alternateKey("b");
  const terminal = aggregateShadowFeedbackArtifacts({
    expectedKeys: [keyA, keyB],
    artifacts: [completedArtifact(keyA), failedArtifact(keyB, "fenced")],
  });
  assert.equal(terminal.status, "incomplete");
  assert.deepEqual(terminal.missingKeyFingerprints, []);
  assert.deepEqual(terminal.failedKeyFingerprints, [keyB.keyFingerprint]);
});

test("report parser rejects dishonest status and failure totals", () => {
  const projection = projectionFor(1);
  const keyA = expectedKey(projection);
  const keyB = alternateKey("b");
  const report = compareShadowFeedbackWithBatch({
    batchAuthority: batchAuthority(projection),
    artifactSet: {
      contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
      sessionId: SESSION_ID,
      status: "incomplete",
      expectedKeyFingerprints: [keyA.keyFingerprint, keyB.keyFingerprint],
      artifacts: [completedArtifact(keyA), failedArtifact(keyB, "internal")],
      missingKeyFingerprints: [],
      failedKeyFingerprints: [keyB.keyFingerprint],
    },
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });
  assert.deepEqual(parseShadowFeedbackComparisonReport(report), report);
  assert.throws(
    () =>
      parseShadowFeedbackComparisonReport({
        ...report,
        failures: { ...report.failures, internal: 0 },
      }),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parseShadowFeedbackComparisonReport({ ...report, status: "complete" }),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parseShadowFeedbackComparisonReport({
        ...report,
        latency: { kind: "post_freeze_potential", potentialLeadMs: 0 },
      }),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parseShadowFeedbackComparisonReport({
        ...report,
        mode: { ...report.mode, batch: null },
      }),
    /invalid_shape/
  );

  const invalid = compareShadowFeedbackWithBatch({
    batchAuthority: {},
    artifactSet: {},
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });
  assert.equal(invalid.status, "invalid");
  const invalidForgeries = [
    { ...invalid, facets: { ...invalid.facets, matched: 1 } },
    {
      ...invalid,
      mode: {
        agreement: "unavailable" as const,
        batch: "full_scorecard" as const,
        shadow: null,
      },
    },
    {
      ...invalid,
      scores: {
        comparable: 1,
        exact: 1,
        withinOne: 0,
        disagree: 0,
        notComparable: FEEDBACK_DIMENSIONS.length - 1,
      },
    },
    {
      ...invalid,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostMicros: 0,
      },
    },
    {
      ...invalid,
      latency: { kind: "post_freeze_potential" as const, potentialLeadMs: 0 },
    },
  ];
  for (const forged of invalidForgeries) {
    assert.throws(
      () => parseShadowFeedbackComparisonReport(forged),
      /invalid_shape/
    );
  }
});

test("failed terminal artifacts never claim feedback latency", () => {
  const projection = projectionFor(1);
  const key = expectedKey(projection);
  const report = compareShadowFeedbackWithBatch({
    batchAuthority: batchAuthority(projection, FREEZE_ANCHOR_MS + 5_000),
    artifactSet: aggregateShadowFeedbackArtifacts({
      expectedKeys: [key],
      artifacts: [failedArtifact(key, "internal")],
    }),
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });
  assert.equal(report.status, "incomplete");
  assert.deepEqual(report.latency, {
    kind: "unavailable",
    potentialLeadMs: null,
  });
});

test("comparison reports aggregate agreement, bounded cost, and anchored post-freeze lead", () => {
  const projection = projectionFor(1);
  const key = expectedKey(projection);
  const artifact = completedArtifact(key, {
    completedAt: "2026-08-14T10:00:02.000Z",
    usage: { input: 100, cached: 40, output: 50 },
  });
  const artifactSet = aggregateShadowFeedbackArtifacts({
    expectedKeys: [key],
    artifacts: [artifact],
  });
  const report = compareShadowFeedbackWithBatch({
    batchAuthority: batchAuthority(projection, FREEZE_ANCHOR_MS + 5_000),
    artifactSet,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    costRates: {
      contractVersion: SHADOW_FEEDBACK_COST_RATES_VERSION,
      inputMicrosPerMillion: 1_000_000,
      cachedInputMicrosPerMillion: 500_000,
      outputMicrosPerMillion: 2_000_000,
    },
  });
  assert.equal(report.status, "complete");
  assert.deepEqual(report.facets, { matched: 10, batchOnly: 0, shadowOnly: 0 });
  assert.deepEqual(report.mode, {
    agreement: "agree",
    batch: "full_scorecard",
    shadow: "full_scorecard",
  });
  assert.deepEqual(report.scores, {
    comparable: 5,
    exact: 5,
    withinOne: 0,
    disagree: 0,
    notComparable: 0,
  });
  assert.deepEqual(report.usage, {
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 50,
    totalTokens: 150,
    estimatedCostMicros: 180,
  });
  assert.deepEqual(report.latency, {
    kind: "post_freeze_potential",
    potentialLeadMs: 3_000,
  });

  assert.deepEqual(
    compareShadowFeedbackWithBatch({
      batchAuthority: {
        ...batchAuthority(projection, FREEZE_ANCHOR_MS + 5_000),
        terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS + 1,
      },
      artifactSet,
      terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    }).latency,
    { kind: "unavailable", potentialLeadMs: null }
  );
});

test("cross-block batch scores are explicitly not comparable", () => {
  const projection = projectionFor(1);
  const keyA = expectedKey(projection);
  const keyB = alternateKey("b");
  const batch = batchAuthority(projection);
  const dimension = FEEDBACK_DIMENSIONS[0];
  batch.dimensions[dimension].facets[1] = {
    ...batch.dimensions[dimension].facets[1]!,
    trustedBlockFingerprint: keyB.trustedBlockFingerprint,
  };
  const report = compareShadowFeedbackWithBatch({
    batchAuthority: batch,
    artifactSet: aggregateShadowFeedbackArtifacts({
      expectedKeys: [keyA, keyB],
      artifacts: [completedArtifact(keyA), completedArtifact(keyB)],
    }),
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });
  assert.equal(report.scores.notComparable, 1);
  assert.equal(report.scores.comparable, 4);
});

function projectionFor(
  segmentCount: (typeof ANSWER_BLOCK_SEGMENT_COUNTS)[number]
): TrustedAnswerBlockProjection {
  const fixture = createAnswerBlockSegmentationFixture(segmentCount);
  const projection = projectTrustedClosedAnswerBlocks(
    fixture.events,
    authority(fixture.events)
  );
  assert.equal(projection.status, "complete");
  return projection;
}

function expectedKey(
  projection: TrustedAnswerBlockProjection
): ShadowFeedbackArtifactKeyV1 {
  return createShadowFeedbackSchedulingIntents({
    sessionId: SESSION_ID,
    projection,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    selectionSchemaVersion:
      FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
  })[0]!.key;
}

function alternateKey(seed: string): ShadowFeedbackArtifactKeyV1 {
  return createShadowFeedbackArtifactKey({
    sessionId: SESSION_ID,
    trustedBlockIdentity: {
      contractVersion: "trusted-answer-block-identity.v1",
      answerBlockId: `answer-block:${seed}`,
      identity: `trusted-answer-block.v1:${seed.repeat(64)}`,
    },
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    selectionSchemaVersion:
      FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
  });
}

function completedArtifact(
  key: ShadowFeedbackArtifactKeyV1,
  options: {
    completedAt?: string;
    usage?: { input: number; cached: number; output: number };
  } = {}
): ShadowFeedbackArtifactV1 {
  const dimensions = Object.fromEntries(
    FEEDBACK_DIMENSIONS.map((dimension) => [
      dimension,
      {
        score: 5,
        facetCodes: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
          dimension
        ].facets
          .slice(0, 2)
          .map(({ code }) => code)
          .sort(),
      },
    ])
  ) as ShadowFeedbackArtifactV1["outcome"] extends infer _T
    ? Record<
        (typeof FEEDBACK_DIMENSIONS)[number],
        { score: number; facetCodes: string[] }
      >
    : never;
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: {
      state: "completed",
      roundType: "product_sense",
      mode: "full_scorecard",
      dimensions,
    },
    metrics: options.usage
      ? {
          durationMs: 1_000,
          inputTokens: options.usage.input,
          cachedInputTokens: options.usage.cached,
          outputTokens: options.usage.output,
          totalTokens: options.usage.input + options.usage.output,
        }
      : {
          durationMs: 1_000,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
    completedAt: options.completedAt ?? "2026-08-14T10:00:02.000Z",
  };
}

function failedArtifact(
  key: ShadowFeedbackArtifactKeyV1,
  failureClass: "internal" | "fenced"
): ShadowFeedbackArtifactV1 {
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: { state: "failed", failureClass },
    metrics: {
      durationMs: 1_000,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2026-08-14T10:00:02.000Z",
  };
}

function batchAuthority(
  projection: TrustedAnswerBlockProjection,
  completedAtMs = FREEZE_ANCHOR_MS + 5_000
) {
  const answerBlockRef = projection.trustedBlocks[0]!.answerBlockId;
  const dimensions = Object.fromEntries(
    FEEDBACK_DIMENSIONS.map((dimension) => {
      const facets = ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
        dimension
      ].facets.slice(0, 2);
      return [
        dimension,
        {
          coverage: "sufficient",
          score: 5,
          evidence: facets.map((facet) => ({
            facetCode: facet.code,
            facetLabel: facet.label,
            answerBlockRef,
            evidenceText: "synthetic evidence stripped by the adapter",
          })),
        },
      ];
    })
  );
  const feedback = {
    roundType: "product_sense",
    mode: "full_scorecard",
    dimensions,
  } as unknown as DimensionCoverageFeedbackResult;
  return createShadowFeedbackBatchAuthority({
    feedback,
    projection,
    sessionId: SESSION_ID,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    completedAtMs,
  });
}

function authority(
  events: ReturnType<typeof createAnswerBlockSegmentationFixture>["events"]
): FrozenAnswerBlockAuthorityV1 {
  const sequenced = events.filter(
    (event): event is Extract<(typeof events)[number], { sequence: number }> =>
      "sequence" in event
  );
  const terminal = events.at(-1)!;
  return {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState: "complete",
    cutoffAtMs:
      terminal.kind === "session_end" || terminal.kind === "cutoff"
        ? terminal.occurredAtMs
        : 0,
    writers: [
      {
        contractVersion: 1,
        writerId: sequenced[0]!.writerId,
        writerGeneration: sequenced[0]!.writerGeneration,
        committedSequence: sequenced.length,
        integrityState: "healthy",
        settlementState: "settled",
      },
    ],
  };
}

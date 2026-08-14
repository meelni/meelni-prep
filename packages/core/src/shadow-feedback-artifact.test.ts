import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
  aggregateShadowFeedbackArtifacts,
  createShadowFeedbackArtifactKey,
  parseShadowFeedbackArtifact,
  parseShadowFeedbackArtifactKey,
  projectTrustedClosedAnswerBlocks,
  type FrozenAnswerBlockAuthorityV1,
  type ShadowFeedbackArtifactV1,
} from "./index";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "../../test-fixtures/src/answer-blocks";

const SESSION_ID = "44500000-0000-4000-8000-000000000445";
const MODEL_VERSION = "synthetic-shadow-model.v1";

test("artifact key SHA-256 binds the exact session, trusted block, and version tuple", () => {
  const key = keyForFingerprint(`trusted-answer-block.v1:${"a".repeat(64)}`);
  const material = JSON.stringify([
    SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION,
    SESSION_ID,
    `trusted-answer-block.v1:${"a".repeat(64)}`,
    FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    MODEL_VERSION,
  ]);

  assert.equal(
    key.keyFingerprint,
    `shadow-feedback-artifact-key.v1:${createHash("sha256").update(material).digest("hex")}`
  );
  assert.deepEqual(parseShadowFeedbackArtifactKey(key), key);

  for (const changed of [
    { sessionId: "44500000-0000-4000-8000-000000000446" },
    { trustedBlockFingerprint: `trusted-answer-block.v1:${"b".repeat(64)}` },
    { rubricVersion: "pm-feedback-rubric.v4" },
    { promptVersion: "feedback.prompt.dimension-coverage.v2" },
    { selectionSchemaVersion: "feedback.dimension-coverage.selection.v2" },
    { modelVersion: "synthetic-shadow-model.v2" },
  ]) {
    const changedKey = keyForFingerprint(
      changed.trustedBlockFingerprint ?? key.trustedBlockFingerprint,
      { ...changed }
    );
    assert.notEqual(changedKey.keyFingerprint, key.keyFingerprint);
  }
});

test("equivalent 1, 2, 5, and 10 segment ledgers produce one artifact key", () => {
  const keys = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const fixture = createAnswerBlockSegmentationFixture(segmentCount);
    const projection = projectTrustedClosedAnswerBlocks(
      fixture.events,
      authority(fixture.events)
    );
    assert.equal(projection.status, "complete");
    return createShadowFeedbackArtifactKey({
      sessionId: SESSION_ID,
      trustedBlockIdentity: projection.trustedBlockIdentities[0]!,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      selectionSchemaVersion:
        FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      modelVersion: MODEL_VERSION,
    });
  });

  assert.equal(
    new Set(keys.map(({ keyFingerprint }) => keyFingerprint)).size,
    1
  );
});

test("artifact parser is bounded, closed, and rejects unknown contract versions", () => {
  const artifact = artifactFor(
    keyForFingerprint(`trusted-answer-block.v1:${"a".repeat(64)}`)
  );
  assert.deepEqual(parseShadowFeedbackArtifact(artifact), artifact);

  assert.throws(
    () =>
      parseShadowFeedbackArtifact({
        ...artifact,
        contractVersion: "feedback.shadow-artifact.v0",
      }),
    /version_unsupported/
  );
  assert.throws(
    () => parseShadowFeedbackArtifact({ ...artifact, providerPayload: {} }),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parseShadowFeedbackArtifact({
        ...artifact,
        metrics: { ...artifact.metrics, totalTokens: 141 },
      }),
    /invalid_shape/
  );
  assert.throws(
    () =>
      createShadowFeedbackArtifactKey({
        sessionId: SESSION_ID,
        trustedBlockIdentity: {
          contractVersion: "trusted-answer-block-identity.v1",
          answerBlockId: "answer-block:0001",
          identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
        },
        rubricVersion: "r".repeat(97),
        promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
        selectionSchemaVersion:
          FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
        modelVersion: MODEL_VERSION,
      }),
    /invalid_shape/
  );
});

test("exact-key aggregation ignores stale tuples and fails closed on unknown rows", () => {
  const currentKey = keyForFingerprint(
    `trusted-answer-block.v1:${"a".repeat(64)}`
  );
  const staleKey = keyForFingerprint(
    `trusted-answer-block.v1:${"a".repeat(64)}`,
    { modelVersion: "synthetic-shadow-model.retired" }
  );
  const current = artifactFor(currentKey);
  const stale = artifactFor(staleKey);

  const aggregated = aggregateShadowFeedbackArtifacts({
    expectedKeys: [currentKey],
    artifacts: [stale, current],
  });
  assert.equal(aggregated.status, "complete");
  assert.deepEqual(
    aggregated.artifacts.map(({ key }) => key.keyFingerprint),
    [currentKey.keyFingerprint]
  );

  assert.equal(
    aggregateShadowFeedbackArtifacts({
      expectedKeys: [currentKey],
      artifacts: [
        { ...current, contractVersion: "feedback.shadow-artifact.v0" },
      ],
    }).status,
    "invalid"
  );
  assert.equal(
    aggregateShadowFeedbackArtifacts({
      expectedKeys: [currentKey],
      artifacts: Array.from({ length: 1_001 }, () => current),
    }).status,
    "invalid"
  );
});

function keyForFingerprint(
  trustedBlockFingerprint: string,
  changes: Partial<{
    sessionId: string;
    rubricVersion: string;
    promptVersion: string;
    selectionSchemaVersion: string;
    modelVersion: string;
  }> = {}
) {
  return createShadowFeedbackArtifactKey({
    sessionId: changes.sessionId ?? SESSION_ID,
    trustedBlockIdentity: {
      contractVersion: "trusted-answer-block-identity.v1",
      answerBlockId: "answer-block:0001",
      identity: trustedBlockFingerprint as `trusted-answer-block.v1:${string}`,
    },
    rubricVersion:
      changes.rubricVersion ?? FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    promptVersion:
      changes.promptVersion ?? FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    selectionSchemaVersion:
      changes.selectionSchemaVersion ??
      FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    modelVersion: changes.modelVersion ?? MODEL_VERSION,
  });
}

function artifactFor(
  key: ReturnType<typeof keyForFingerprint>
): ShadowFeedbackArtifactV1 {
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: {
      state: "completed",
      roundType: "product_sense",
      mode: "coaching_review",
      dimensions: {
        structure: { score: null, facetCodes: [] },
        clarity: { score: null, facetCodes: [] },
        insight: { score: null, facetCodes: [] },
        communication: { score: null, facetCodes: [] },
        leadership: { score: null, facetCodes: [] },
      },
    },
    metrics: {
      durationMs: 1_200,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 40,
      totalTokens: 140,
    },
    completedAt: "2026-08-14T10:00:00.000Z",
  };
}

function authority(
  events: ReturnType<typeof createAnswerBlockSegmentationFixture>["events"]
): FrozenAnswerBlockAuthorityV1 {
  const terminal = events.at(-1)!;
  assert.equal(terminal.kind, "session_end");
  return {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState: "complete",
    cutoffAtMs: "occurredAtMs" in terminal ? terminal.occurredAtMs : 0,
    writers: [
      {
        contractVersion: 1,
        writerId: "synthetic-writer",
        writerGeneration: 1,
        committedSequence: events.length - 1,
        integrityState: "healthy",
        settlementState: "settled",
      },
    ],
  };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  deriveCandidateAnswerBlocks,
  parseDimensionCoverageProviderSelection,
  type AnswerBlockLedgerEvent,
  type DimensionCoverageProviderSelection,
} from "@meelni/core";
import {
  DIMENSION_COVERAGE_CALIBRATION_CASES,
  DIMENSION_COVERAGE_CALIBRATION_VERSION,
} from "@meelni/test-fixtures";
import { calculateValidatedSessionFromTurns } from "./session-validator";

test("synthetic dimension-coverage calibration manifest is broad and round-complete", () => {
  assert.equal(
    DIMENSION_COVERAGE_CALIBRATION_VERSION,
    "dimension-coverage-calibration.v1"
  );
  assert.equal(
    new Set(DIMENSION_COVERAGE_CALIBRATION_CASES.map((entry) => entry.id)).size,
    DIMENSION_COVERAGE_CALIBRATION_CASES.length
  );
  for (const family of [
    "natural_spoken_answer",
    "punctuation_poor_stt",
    "concise_answer",
    "filler",
    "keyword_salad",
    "repeated_token_stuffing",
    "low_density_engineered_anchors",
    "semantic_absurdity",
    "prompt_injection",
    "off_topic_prose",
    "sparse_coverage",
    "complete_coverage",
  ] as const) {
    assert.ok(
      DIMENSION_COVERAGE_CALIBRATION_CASES.some(
        (entry) => entry.family === family
      ),
      family
    );
  }
  for (const roundType of [
    "product_sense",
    "execution",
    "behavioral",
    "strategy",
  ] as const) {
    assert.ok(
      DIMENSION_COVERAGE_CALIBRATION_CASES.some(
        (entry) =>
          entry.roundType === roundType && entry.family === "complete_coverage"
      ),
      roundType
    );
  }
});

test("synthetic dimension-coverage corpus is hash-bound", () => {
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(DIMENSION_COVERAGE_CALIBRATION_CASES))
      .digest("hex"),
    "f541cd462e6db78aa3713860c219794303ca37e640379b5ea8fb8adf89e1f7d3"
  );
});

test("adjudicated synthetic cases produce only their closed outcome", () => {
  for (const entry of DIMENSION_COVERAGE_CALIBRATION_CASES) {
    const events = answerEvents(entry.responseText);
    const validation = calculateValidatedSessionFromTurns(
      events.flatMap((event) =>
        event.kind === "turn"
          ? [
              {
                speaker: event.speaker,
                text: event.text,
                startedAt: new Date(event.startedAtMs),
                endedAt: new Date(event.endedAtMs),
                eventId: event.eventId,
                contractVersion: event.contractVersion,
                writerId: event.writerId,
                writerGeneration: event.writerGeneration,
                sequence: event.sequence,
                audioMs: event.audioDurationMs,
                section: event.section,
                deliveryState: event.deliveryState,
              },
            ]
          : []
      )
    );
    if (entry.expectedOutcome === "unable_to_review_integrity") {
      assert.equal(
        validation.evidenceFailureReason,
        "transcript_integrity_degraded",
        entry.id
      );
      continue;
    }
    if (entry.expectedOutcome === "unable_to_review_no_usable_answer") {
      assert.equal(
        validation.evidenceFailureReason,
        "no_reviewable_answer",
        entry.id
      );
      continue;
    }
    assert.equal(validation.isValid, true, entry.id);
    const blocks = deriveCandidateAnswerBlocks(events).blocks;
    assert.equal(blocks.length, 1, entry.id);
    const result = parseDimensionCoverageProviderSelection(
      selection(entry, blocks[0]!.answerBlockId),
      {
        roundType: entry.roundType,
        answerBlocks: blocks,
        modelVersion: "synthetic-calibration-v1",
        allowNumericalScores: true,
      }
    );
    assert.equal(result.mode, entry.expectedOutcome, entry.id);
    assert.equal(
      result.overallScore === null,
      entry.expectedOutcome !== "full_scorecard",
      entry.id
    );
  }
});

function selection(
  entry: (typeof DIMENSION_COVERAGE_CALIBRATION_CASES)[number],
  answerBlockRef: string
): DimensionCoverageProviderSelection {
  assert.ok(entry.facetCounts);
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount = entry.facetCounts[dimension];
    dimensions[dimension] = {
      score: facetCount === 2 ? 8 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG[entry.roundType][
        dimension
      ].facets
        .slice(0, facetCount)
        .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType: entry.roundType,
    dimensions,
  };
}

function answerEvents(responseText: string): AnswerBlockLedgerEvent[] {
  return [
    turn(1, "interviewer", "Walk me through your answer."),
    turn(2, "user", responseText),
    {
      kind: "session_end",
      occurredAtMs: 4_000,
    },
  ];
}

function turn(
  sequence: number,
  speaker: "user" | "interviewer",
  text: string
): Extract<AnswerBlockLedgerEvent, { kind: "turn" }> {
  return {
    kind: "turn",
    contractVersion: 2,
    eventId: `synthetic:${sequence}`,
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence,
    speaker,
    text,
    isFinal: true,
    startedAtMs: sequence * 1_000,
    endedAtMs: sequence * 1_000 + 500,
    audioDurationMs: 500,
    section: "synthetic-calibration",
    deliveryState: "delivered",
  };
}

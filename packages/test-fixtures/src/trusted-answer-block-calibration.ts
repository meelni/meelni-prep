import type {
  AnswerBlockLedgerEvent,
  FrozenAnswerBlockAuthorityV1,
  TrustedAnswerBlockAuthorityFailureReason,
  TrustedAnswerBlockProjectionStatus,
} from "@meelni/core";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
  createAnswerBlockTurn,
} from "./answer-blocks";

export const TRUSTED_ANSWER_BLOCK_CALIBRATION_VERSION =
  "trusted-answer-block-calibration.v1" as const;

export type TrustedAnswerBlockCalibrationFamily =
  | "segmentation"
  | "terminal_preserving_marker"
  | "candidate_marker"
  | "canonicalization_failure"
  | "sequence_gap"
  | "writer_drift"
  | "degraded_writer"
  | "cutoff_conflict"
  | "exact_replay"
  | "conflicting_replay"
  | "historical_authority";

export interface TrustedAnswerBlockCalibrationCase {
  id: string;
  provenance: "fully_synthetic";
  version: typeof TRUSTED_ANSWER_BLOCK_CALIBRATION_VERSION;
  family: TrustedAnswerBlockCalibrationFamily;
  events: AnswerBlockLedgerEvent[];
  authority: unknown;
  expectedStatus: TrustedAnswerBlockProjectionStatus;
  expectedFailureReason: TrustedAnswerBlockAuthorityFailureReason | null;
  expectedTrustedResponseTexts: string[];
  expectedExcludedAnswerBlockIds: string[];
}

const segmentationCases = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
  const fixture = createAnswerBlockSegmentationFixture(segmentCount);
  return calibrationCase({
    id: `segmentation-${segmentCount}`,
    family: "segmentation",
    events: fixture.events,
    authority: authority(fixture.events, "complete", "settled"),
    expectedStatus: "complete",
    expectedFailureReason: null,
    expectedTrustedResponseTexts: fixture.expectedReviewability.map(
      ({ responseText }) => responseText
    ),
    expectedExcludedAnswerBlockIds: [],
  });
});

const prompt = turn(1, "interviewer", "Frame the product decision.", 0);
const answer = turn(
  2,
  "user",
  "I would begin with working caregivers because the handoff failure repeats every week.",
  1_000
);
const followUp = turn(
  3,
  "interviewer",
  "Which assumption would you test first?",
  2_000
);
const tail = turn(
  4,
  "user",
  "I would test whether the coordination failure remains severe before building.",
  3_000
);

export const TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES = [
  ...segmentationCases,
  calibrationCase({
    id: "terminal-preserving-marker",
    family: "terminal_preserving_marker",
    events: [
      prompt,
      answer,
      followUp,
      tail,
      marker(5, "interviewer", "no_provider_confirmed_prefix", 4_100),
      terminal(5_000),
    ],
    authority: authority(
      [
        prompt,
        answer,
        followUp,
        tail,
        marker(5, "interviewer", "no_provider_confirmed_prefix", 4_100),
        terminal(5_000),
      ],
      "partial",
      "missing"
    ),
    expectedStatus: "verified_prefix",
    expectedFailureReason: null,
    expectedTrustedResponseTexts: [answer.text],
    expectedExcludedAnswerBlockIds: ["answer-block:0002"],
  }),
  failureCase(
    "candidate-marker",
    "candidate_marker",
    [
      prompt,
      answer,
      marker(3, "user", "no_provider_confirmed_prefix", 2_100),
      terminal(3_000),
    ],
    "canonicalization_failure"
  ),
  failureCase(
    "canonicalization-failure",
    "canonicalization_failure",
    [
      prompt,
      answer,
      marker(3, "interviewer", "canonicalization_failed", 2_100),
      terminal(3_000),
    ],
    "canonicalization_failure"
  ),
  failureCase(
    "sequence-gap",
    "sequence_gap",
    [
      prompt,
      { ...answer, sequence: 3, eventId: "synthetic-writer:3" },
      terminal(3_000),
    ],
    "sequence_gap"
  ),
  failureCase(
    "writer-drift",
    "writer_drift",
    [
      prompt,
      {
        ...answer,
        eventId: "replacement-writer:1",
        writerId: "replacement-writer",
        writerGeneration: 2,
        sequence: 1,
      },
      terminal(3_000),
    ],
    "writer_drift"
  ),
  calibrationCase({
    id: "degraded-writer-integrity",
    family: "degraded_writer",
    events: [prompt, answer, terminal(3_000)],
    authority: authority(
      [prompt, answer, terminal(3_000)],
      "complete",
      "settled",
      "degraded"
    ),
    expectedStatus: "integrity_failure",
    expectedFailureReason: "writer_degraded",
    expectedTrustedResponseTexts: [],
    expectedExcludedAnswerBlockIds: [],
  }),
  calibrationCase({
    id: "degraded-writer-settlement",
    family: "degraded_writer",
    events: [prompt, answer, terminal(3_000)],
    authority: authority(
      [prompt, answer, terminal(3_000)],
      "partial",
      "degraded"
    ),
    expectedStatus: "integrity_failure",
    expectedFailureReason: "writer_degraded",
    expectedTrustedResponseTexts: [],
    expectedExcludedAnswerBlockIds: [],
  }),
  failureCase(
    "turn-after-cutoff",
    "cutoff_conflict",
    [
      prompt,
      turn(2, "user", "This answer ends beyond the frozen cutoff.", 2_500),
      terminal(3_000),
    ],
    "cutoff_conflict"
  ),
  failureCase(
    "marker-after-cutoff",
    "cutoff_conflict",
    [
      prompt,
      answer,
      marker(3, "interviewer", "no_provider_confirmed_prefix", 3_100),
      terminal(3_000),
    ],
    "cutoff_conflict"
  ),
  replayCase(false),
  replayCase(true),
  calibrationCase({
    id: "historical-authority-version",
    family: "historical_authority",
    events: [prompt, answer, terminal(3_000)],
    authority: {
      ...authority([prompt, answer, terminal(3_000)], "complete", "settled"),
      contractVersion: "frozen-answer-block-authority.v0",
    },
    expectedStatus: "integrity_failure",
    expectedFailureReason: "authority_contract_unsupported",
    expectedTrustedResponseTexts: [],
    expectedExcludedAnswerBlockIds: [],
  }),
] as const satisfies readonly TrustedAnswerBlockCalibrationCase[];

function replayCase(conflicting: boolean): TrustedAnswerBlockCalibrationCase {
  const replay = {
    ...turn(
      3,
      "user",
      conflicting ? `${answer.text} conflicting correction` : answer.text,
      2_100
    ),
    kind: "semantic_replay" as const,
    replayOfEventId: answer.eventId,
  };
  const replayFollowUp = turn(
    4,
    "interviewer",
    "What result would change your plan?",
    3_100
  );
  const events = [prompt, answer, replay, replayFollowUp, terminal(5_000)];
  return calibrationCase({
    id: conflicting ? "conflicting-replay" : "exact-replay",
    family: conflicting ? "conflicting_replay" : "exact_replay",
    events,
    authority: authority(events, "complete", "settled"),
    expectedStatus: conflicting ? "integrity_failure" : "complete",
    expectedFailureReason: conflicting ? "replay_conflict" : null,
    expectedTrustedResponseTexts: conflicting ? [] : [answer.text],
    expectedExcludedAnswerBlockIds: [],
  });
}

function failureCase(
  id: string,
  family: TrustedAnswerBlockCalibrationFamily,
  events: AnswerBlockLedgerEvent[],
  expectedFailureReason: TrustedAnswerBlockAuthorityFailureReason
): TrustedAnswerBlockCalibrationCase {
  return calibrationCase({
    id,
    family,
    events,
    authority: authority(events, "complete", "settled"),
    expectedStatus: "integrity_failure",
    expectedFailureReason,
    expectedTrustedResponseTexts: [],
    expectedExcludedAnswerBlockIds: [],
  });
}

function calibrationCase(
  input: Omit<TrustedAnswerBlockCalibrationCase, "provenance" | "version">
): TrustedAnswerBlockCalibrationCase {
  return {
    ...input,
    provenance: "fully_synthetic",
    version: TRUSTED_ANSWER_BLOCK_CALIBRATION_VERSION,
  };
}

function authority(
  events: readonly AnswerBlockLedgerEvent[],
  snapshotState: "complete" | "partial",
  settlementState: "settled" | "missing" | "degraded",
  integrityState: "healthy" | "degraded" = "healthy"
): FrozenAnswerBlockAuthorityV1 {
  const sequences = events.flatMap((event) =>
    "sequence" in event ? [event.sequence] : []
  );
  return {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState,
    cutoffAtMs:
      events.findLast(
        (event) => event.kind === "session_end" || event.kind === "cutoff"
      )?.occurredAtMs ?? 0,
    writers: [
      {
        contractVersion: 1,
        writerId: "synthetic-writer",
        writerGeneration: 1,
        committedSequence: Math.max(0, ...sequences),
        integrityState,
        settlementState,
      },
    ],
  };
}

function turn(
  sequence: number,
  speaker: "user" | "interviewer",
  text: string,
  startedAtMs: number
) {
  return createAnswerBlockTurn({
    sequence,
    eventId: `synthetic-writer:${sequence}`,
    speaker,
    text,
    startedAtMs,
    endedAtMs: startedAtMs + 800,
    audioDurationMs: 800,
  });
}

function marker(
  sequence: number,
  speaker: "user" | "interviewer",
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed",
  occurredAtMs: number
) {
  return {
    kind: "integrity_boundary" as const,
    eventId: `synthetic-writer:${sequence}`,
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence,
    speaker,
    occurredAtMs,
    reason,
  };
}

function terminal(occurredAtMs: number) {
  return { kind: "session_end" as const, occurredAtMs };
}

import { describe, expect, it } from "vitest";
import { TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES } from "@meelni/test-fixtures";

import { evaluateSkippedFeedbackRecovery } from "../skipped-feedback-recovery";
import type { FrozenCandidateAnswerBlockEvidenceSnapshot } from "../session-validator";

describe("evaluateSkippedFeedbackRecovery", () => {
  it("authorizes a conservative partial retry only with trusted closed blocks", () => {
    const fixture = TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.find(
      ({ id }) => id === "repeated-mid-session-preserving-markers"
    )!;

    expect(evaluateSkippedFeedbackRecovery(frozenFixture(fixture))).toEqual({
      eligible: true,
      completionTier: "partial",
      evidenceFailureReason: null,
      trustedBlockCount: 1,
    });
  });

  it("fails closed for invalid snapshots and missing authority", () => {
    const fixture = TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.find(
      ({ id }) => id === "repeated-mid-session-preserving-markers"
    )!;
    const evidence = frozenFixture(fixture);

    for (const invalid of [
      { ...evidence, snapshotValid: false },
      { ...evidence, snapshotState: null },
      { ...evidence, authority: null },
      { ...evidence, sourceOverflow: true },
    ]) {
      const result = evaluateSkippedFeedbackRecovery(invalid);
      expect(result.eligible).toBe(false);
      expect(result.completionTier).toBeNull();
      expect(result.trustedBlockCount).toBe(0);
    }
  });
});

function frozenFixture(
  fixture: (typeof TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES)[number]
): FrozenCandidateAnswerBlockEvidenceSnapshot {
  const terminal = fixture.events.at(-1)!;
  return {
    snapshotValid: true,
    snapshotState: "partial",
    turns: fixture.events.flatMap((event) =>
      event.kind === "turn"
        ? [
            {
              contractVersion: event.contractVersion,
              eventId: event.eventId,
              writerId: event.writerId,
              writerGeneration: event.writerGeneration,
              sequence: event.sequence,
              speaker: event.speaker,
              text: event.text,
              startedAt: new Date(event.startedAtMs),
              endedAt: new Date(event.endedAtMs),
              audioMs: event.audioDurationMs,
              section: event.section,
              deliveryState: event.deliveryState,
            },
          ]
        : []
    ),
    interruptions: fixture.events.flatMap((event) =>
      event.kind === "integrity_boundary"
        ? [
            {
              eventId: event.eventId,
              writerId: event.writerId,
              writerGeneration: event.writerGeneration,
              sequence: event.sequence,
              speaker: event.speaker,
              occurredAt: new Date(event.occurredAtMs),
              reason: event.reason,
            },
          ]
        : []
    ),
    sessionEndAt:
      terminal.kind === "session_end" ? new Date(terminal.occurredAtMs) : null,
    sourceOverflow: false,
    authority: fixture.authority as never,
  };
}

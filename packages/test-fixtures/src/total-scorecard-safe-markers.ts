import type {
  AnswerBlockLedgerEvent,
  FrozenAnswerBlockAuthorityV1,
} from "@meelni/core";

import { createAnswerBlockTurn } from "./answer-blocks";

export const TOTAL_SCORECARD_SAFE_MARKER_FIXTURE_VERSION =
  "total-scorecard-safe-markers.v1" as const;

export interface TotalScorecardSafeMarkerFixture {
  provenance: "fully_synthetic";
  version: typeof TOTAL_SCORECARD_SAFE_MARKER_FIXTURE_VERSION;
  events: AnswerBlockLedgerEvent[];
  authority: FrozenAnswerBlockAuthorityV1;
  expectedResponseTexts: readonly string[];
}

const EXCHANGES = [
  {
    prompt: "Which customer problem would you prioritize first?",
    response:
      "I would prioritize coordinators with weekly handoff failures because the repeated delay is measurable and urgent.",
  },
  {
    prompt: "How would you structure the first validation step?",
    response:
      "I would compare the current handoff path with a guided alternative, then sequence the riskiest assumption before implementation.",
  },
  {
    prompt: "Which signal would change your product decision?",
    response:
      "I would track confirmed handoffs and time to resolution, with missed confirmations as a guardrail before expanding scope.",
  },
  {
    prompt: "How would you align the team on that tradeoff?",
    response:
      "I would state the decision rule, show the supporting evidence, and invite objections before the milestone is committed.",
  },
  {
    prompt: "What would you own if the first release underperformed?",
    response:
      "I would own the rollout decision, review the failed assumption, and narrow the release while preserving the user outcome.",
  },
] as const;

/**
 * Fully synthetic production-shaped authority pair. Repeated exact safe
 * markers are the only semantic difference; candidate prompts, answers, and
 * timings remain identical.
 */
export function createTotalScorecardSafeMarkerFixture(
  repeatedSafeMarkers: boolean
): TotalScorecardSafeMarkerFixture {
  const events: AnswerBlockLedgerEvent[] = [];
  let sequence = 0;
  for (const [index, exchange] of EXCHANGES.entries()) {
    const promptStartedAtMs = index * 4_000;
    events.push(
      turn(
        ++sequence,
        "interviewer",
        exchange.prompt,
        promptStartedAtMs,
        `synthetic-total-writer:prompt-${index + 1}`
      )
    );
    if (repeatedSafeMarkers && index % 2 === 0) {
      events.push(marker(++sequence, promptStartedAtMs + 900));
    }
    events.push(
      turn(
        ++sequence,
        "user",
        exchange.response,
        promptStartedAtMs + 1_000,
        `synthetic-total-writer:answer-${index + 1}`
      )
    );
    if (repeatedSafeMarkers && index % 2 === 1) {
      events.push(marker(++sequence, promptStartedAtMs + 1_900));
    }
  }
  events.push(
    turn(
      ++sequence,
      "interviewer",
      "Which part of that decision would you revisit first?",
      20_000,
      "synthetic-total-writer:closing-follow-up"
    )
  );
  if (repeatedSafeMarkers) events.push(marker(++sequence, 20_900));
  events.push({ kind: "session_end", occurredAtMs: 22_000 });

  return {
    provenance: "fully_synthetic",
    version: TOTAL_SCORECARD_SAFE_MARKER_FIXTURE_VERSION,
    events,
    authority: {
      contractVersion: "frozen-answer-block-authority.v1",
      snapshotState: "partial",
      cutoffAtMs: 22_000,
      writers: [
        {
          contractVersion: 1,
          writerId: "synthetic-total-writer",
          writerGeneration: 1,
          committedSequence: sequence,
          integrityState: "healthy",
          settlementState: "settled",
        },
      ],
    },
    expectedResponseTexts: EXCHANGES.map(({ response }) => response),
  };
}

function turn(
  sequence: number,
  speaker: "user" | "interviewer",
  text: string,
  startedAtMs: number,
  eventId: string
) {
  return createAnswerBlockTurn({
    sequence,
    eventId,
    writerId: "synthetic-total-writer",
    speaker,
    text,
    startedAtMs,
    endedAtMs: startedAtMs + 800,
    audioDurationMs: 800,
  });
}

function marker(sequence: number, occurredAtMs: number) {
  return {
    kind: "integrity_boundary" as const,
    eventId: `synthetic-total-writer:${sequence}`,
    writerId: "synthetic-total-writer",
    writerGeneration: 1,
    sequence,
    speaker: "interviewer" as const,
    occurredAtMs,
    reason: "no_provider_confirmed_prefix" as const,
  };
}

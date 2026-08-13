import type {
  AnswerBlockLedgerEvent,
  CanonicalAnswerBlockTurn,
} from "@meelni/core";

export const ANSWER_BLOCK_SEGMENT_COUNTS = [1, 2, 5, 10] as const;

const SYNTHETIC_ANSWERS = [
  "I would begin with working parents because schedule changes create repeated coordination failures, then validate the problem through weekly interviews before choosing a workflow.",
  "I would measure weekly retained households because recurring planning use shows durable value, then monitor missed handoffs and support requests as guardrails.",
] as const;

const SYNTHETIC_PROMPTS = [
  "How would you improve a shared family planning product?",
  "How would you measure whether the product works?",
] as const;

export interface AnswerBlockSegmentationFixture {
  segmentCount: (typeof ANSWER_BLOCK_SEGMENT_COUNTS)[number];
  events: AnswerBlockLedgerEvent[];
  expectedReviewability: Array<{
    answerBlockId: string;
    promptText: string;
    responseText: string;
  }>;
}

export function createAnswerBlockSegmentationFixture(
  segmentCount: AnswerBlockSegmentationFixture["segmentCount"]
): AnswerBlockSegmentationFixture {
  const events: AnswerBlockLedgerEvent[] = [];
  let sequence = 1;
  let cursorMs = Date.parse("2026-08-12T12:00:00.000Z");

  for (const [answerIndex, answer] of SYNTHETIC_ANSWERS.entries()) {
    events.push(
      turn({
        sequence: sequence++,
        speaker: "interviewer",
        text: SYNTHETIC_PROMPTS[answerIndex]!,
        startedAtMs: cursorMs,
        durationMs: 1_000,
      })
    );
    cursorMs += 1_300;
    const fragmentDurationMs = 10_000 / segmentCount;
    for (const fragment of splitWords(answer, segmentCount)) {
      events.push(
        turn({
          sequence: sequence++,
          speaker: "user",
          text: fragment,
          startedAtMs: cursorMs,
          durationMs: fragmentDurationMs,
        })
      );
      cursorMs += fragmentDurationMs;
    }
    cursorMs += 700;
  }
  events.push({ kind: "session_end", occurredAtMs: cursorMs });

  return {
    segmentCount,
    events,
    expectedReviewability: SYNTHETIC_ANSWERS.map((responseText, index) => ({
      answerBlockId: `answer-block:${String(index + 1).padStart(4, "0")}`,
      promptText: SYNTHETIC_PROMPTS[index]!,
      responseText,
    })),
  };
}

export function createAnswerBlockTurn(
  overrides: Partial<CanonicalAnswerBlockTurn> = {}
): CanonicalAnswerBlockTurn {
  return turn({
    sequence: overrides.sequence ?? 1,
    speaker: overrides.speaker ?? "user",
    text:
      overrides.text ??
      "I would prioritize working parents because recurring schedule changes create the clearest weekly coordination problem.",
    startedAtMs:
      overrides.startedAtMs ?? Date.parse("2026-08-12T12:00:00.000Z"),
    durationMs: overrides.audioDurationMs ?? 1_000,
    overrides,
  });
}

function turn(input: {
  sequence: number;
  speaker: "user" | "interviewer";
  text: string;
  startedAtMs: number;
  durationMs: number;
  overrides?: Partial<CanonicalAnswerBlockTurn>;
}): CanonicalAnswerBlockTurn {
  return {
    kind: "turn",
    contractVersion: 2,
    eventId: `synthetic-writer:${input.sequence}`,
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence: input.sequence,
    speaker: input.speaker,
    text: input.text,
    isFinal: true,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.startedAtMs + input.durationMs,
    audioDurationMs: input.durationMs,
    section: "product_sense",
    deliveryState: "delivered",
    ...input.overrides,
  };
}

function splitWords(text: string, count: number): string[] {
  const words = text.split(" ");
  const baseSize = Math.floor(words.length / count);
  const remainder = words.length % count;
  const fragments: string[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    fragments.push(words.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return fragments;
}

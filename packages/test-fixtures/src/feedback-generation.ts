import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import writerSequence6m14 from "../writer-sequence-6m14.json";

export type FeedbackGoldenRoundType =
  | "product_sense"
  | "behavioral"
  | "strategy"
  | "execution";

export interface FeedbackGoldenPathFixture {
  id: string;
  sessionId: string;
  userId: string;
  roomName: string;
  writerId: string;
  roundType: FeedbackGoldenRoundType;
  writerRegistration: TranscriptRuntimeWriterRegistration;
  events: TranscriptEvent[];
  markers: TranscriptInterruptionMarker[];
  settlement: TranscriptRuntimeSettlement;
  ingestSettlement: boolean;
  expectedOutcome:
    | "feedback_generated"
    | "no_reviewable_answer"
    | "transcript_integrity_degraded";
}

const USER_ID = "00000000-0000-4000-8000-000000000397";
const BASE_TIME = Date.parse("2026-08-09T17:52:38.000Z");

const ANSWERS: Record<FeedbackGoldenRoundType, string[]> = {
  product_sense: [
    "I would focus on working parents because recurring schedule changes create weekly coordination pain across the household.",
    "I would compare problem frequency and severity before choosing shared planning as the first workflow for that segment.",
    "I would measure retained weekly plans as the outcome and missed confirmations as a guardrail for the initial cohort.",
    "I would test reminders against a shared calendar concept, then choose the option with stronger completed planning sessions.",
    "I would launch to one city first and expand only after weekly retention and support demand remain within our thresholds.",
  ],
  behavioral: [
    "I led a delayed launch by aligning design and engineering on reduced scope, documenting the tradeoff, and preserving the customer deadline.",
    "I owned the decision log, met each stakeholder individually, and brought the unresolved risks into one cross-functional review.",
    "I measured success through the launch date, customer adoption, and the number of follow-up defects after the release.",
    "I learned that early disagreement needs an explicit decision owner and a written escalation path before delivery pressure rises.",
    "I later reused that approach on another launch and reduced the time required to reach a scoped product decision.",
  ],
  strategy: [
    "I would enter the mid-market first because distribution is reachable and incumbent products underserve workflow integrations.",
    "I would compare market growth, acquisition cost, integration depth, and willingness to switch before committing investment.",
    "I would differentiate on reliable integrations instead of broad feature count because that maps to the selected segment's pain.",
    "I would measure qualified pipeline, activation after integration, retained accounts, and support cost as a strategic guardrail.",
    "I would revisit expansion after two cohorts demonstrate retained usage and repeatable distribution through channel partners.",
  ],
  execution: [
    "I would define retained weekly creators as the outcome metric and publishing latency as the first technical guardrail.",
    "I would sequence account setup before advanced editing because creators cannot reach value until the initial workflow succeeds.",
    "I would assign owners for data migration, editor reliability, and launch readiness with explicit weekly decision checkpoints.",
    "I would cut secondary templates if reliability misses the threshold while preserving the core publishing workflow for launch.",
    "I would expand after retained creation, successful publishing, and support volume remain healthy across two release cohorts.",
  ],
};

function timestamp(offsetMs: number): string {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

function createFixture(input: {
  id: string;
  sessionSuffix: string;
  roundType: FeedbackGoldenRoundType;
  answers?: string[];
  durationMs: number;
  marker?: boolean;
  missingSettlement?: boolean;
  corrupt?: boolean;
  interviewerOnlyTurns?: number;
}): FeedbackGoldenPathFixture {
  const sessionId = `00000000-0000-4000-8000-${input.sessionSuffix.padStart(12, "0")}`;
  const writerId = `writer:${input.id}`;
  const roomName = `interview-${input.id}`;
  const candidateAnswers = input.answers ?? ANSWERS[input.roundType];
  const events: TranscriptEvent[] = [];
  let sequence = 1;
  let offset = 0;
  for (const [index, answer] of candidateAnswers.entries()) {
    const interviewerStart = offset;
    const interviewerEnd = offset + 2_000;
    events.push({
      contract_version: 2,
      event_id: `${writerId}:question:${index + 1}`,
      writer_id: writerId,
      writer_generation: 1,
      sequence: sequence++,
      session_id: sessionId,
      room_name: roomName,
      speaker: "interviewer",
      text: `Question ${index + 1} for the ${input.roundType} interview.`,
      is_final: true,
      started_at: timestamp(interviewerStart),
      ended_at: timestamp(interviewerEnd),
      audio_duration_ms: 2_000,
      section: input.roundType,
      delivery_state: "delivered",
    });
    offset += 3_000;
    const answerStart = offset;
    const answerEnd = offset + 6_000;
    events.push({
      contract_version: 2,
      event_id: `${writerId}:answer:${index + 1}`,
      writer_id: writerId,
      writer_generation: 1,
      sequence: sequence++,
      session_id: sessionId,
      room_name: roomName,
      speaker: "user",
      text: input.corrupt && index === 0 ? "[CORRUPTED]" : answer,
      is_final: true,
      started_at: timestamp(answerStart),
      ended_at: timestamp(answerEnd),
      audio_duration_ms: 6_000,
      section: input.roundType,
      delivery_state: "delivered",
    });
    offset += 7_000;
  }
  for (let index = 0; index < (input.interviewerOnlyTurns ?? 0); index += 1) {
    const startedAt = Math.floor(
      (input.durationMs / Math.max(1, input.interviewerOnlyTurns ?? 1)) * index
    );
    events.push({
      contract_version: 2,
      event_id: `${writerId}:silent-question:${index + 1}`,
      writer_id: writerId,
      writer_generation: 1,
      sequence: sequence++,
      session_id: sessionId,
      room_name: roomName,
      speaker: "interviewer",
      text: `Interviewer prompt ${index + 1}; no candidate answer followed.`,
      is_final: true,
      started_at: timestamp(startedAt),
      ended_at: timestamp(startedAt + 2_000),
      audio_duration_ms: 2_000,
      section: input.roundType,
      delivery_state: "delivered",
    });
  }
  const markers: TranscriptInterruptionMarker[] = input.marker
    ? [
        {
          contract_version: 1,
          event_type: "integrity_unavailable",
          event_id: `${writerId}:marker:1`,
          writer_id: writerId,
          writer_generation: 1,
          sequence: sequence++,
          session_id: sessionId,
          room_name: roomName,
          speaker: "interviewer",
          occurred_at: timestamp(119_000),
          reason: "no_provider_confirmed_prefix",
        },
      ]
    : [];
  if (input.id === "turn-marker-6m14") {
    applySharedWriterSequenceContract(events, markers);
  }
  return {
    id: input.id,
    sessionId,
    userId: USER_ID,
    roomName,
    writerId,
    roundType: input.roundType,
    writerRegistration: {
      contract_version: 1,
      event_type: "runtime_writer_registration",
      session_id: sessionId,
      room_name: roomName,
      writer_id: writerId,
      registered_at: timestamp(0),
    },
    events,
    markers,
    settlement: {
      contract_version: 1,
      event_type: "runtime_settlement",
      session_id: sessionId,
      room_name: roomName,
      writer_id: writerId,
      writer_generation: 1,
      state: input.marker || input.corrupt ? "degraded" : "settled",
      settled_at: timestamp(input.durationMs),
    },
    ingestSettlement: !input.missingSettlement,
    expectedOutcome:
      (input.marker && !input.missingSettlement) || input.corrupt
        ? "transcript_integrity_degraded"
        : candidateAnswers.length === 0
          ? "no_reviewable_answer"
          : "feedback_generated",
  };
}

function applySharedWriterSequenceContract(
  events: TranscriptEvent[],
  markers: TranscriptInterruptionMarker[]
): void {
  const sequences = new Map(
    writerSequence6m14.allocations.map((allocation) => [
      allocation.eventId,
      allocation.sequence,
    ])
  );
  for (const evidence of [...events, ...markers]) {
    const sequence = sequences.get(evidence.event_id);
    if (sequence === undefined) {
      throw new Error(`writer_sequence_golden_missing:${evidence.event_id}`);
    }
    evidence.sequence = sequence;
  }
  if (sequences.size !== events.length + markers.length) {
    throw new Error("writer_sequence_golden_has_unconsumed_allocation");
  }
}

export function createFeedbackGoldenPathFixtures(): FeedbackGoldenPathFixture[] {
  return [
    createFixture({
      id: "normal-product-sense",
      sessionSuffix: "397001",
      roundType: "product_sense",
      durationMs: 374_000,
    }),
    createFixture({
      id: "short-rich",
      sessionSuffix: "397002",
      roundType: "product_sense",
      answers: [ANSWERS.product_sense[0]!],
      durationMs: 48_000,
    }),
    createFixture({
      id: "long-silent",
      sessionSuffix: "397003",
      roundType: "product_sense",
      answers: [],
      durationMs: 1_200_000,
      interviewerOnlyTurns: 3,
    }),
    createFixture({
      id: "no-answer",
      sessionSuffix: "397004",
      roundType: "behavioral",
      answers: [],
      durationMs: 20_000,
    }),
    createFixture({
      id: "turn-marker-6m14",
      sessionSuffix: "397005",
      roundType: "execution",
      answers: [ANSWERS.execution[0]!],
      durationMs: 374_000,
      marker: true,
    }),
    createFixture({
      id: "corrupt",
      sessionSuffix: "397006",
      roundType: "strategy",
      answers: [ANSWERS.strategy[0]!],
      durationMs: 90_000,
      corrupt: true,
    }),
    createFixture({
      id: "spoken-evidence-limited",
      sessionSuffix: "397007",
      roundType: "product_sense",
      answers: [
        "The target customer is neighborhood volunteers. The recurring problem is changing delivery routes. Customer interviews are the first research step. A shared exception queue is the initial product choice. Completed deliveries are the primary metric. Late route changes are a guardrail metric. The evidence supports the next decision.",
        "My recommendation is one coordination moment. The user sees an exception. A new owner takes the route quickly. Two workflow options enter the initial test. Speed is one tradeoff. Operational context is another tradeoff. Customer research informs the product decision.",
        "Success means reliable recovery. Completed deliveries are the primary outcome. Reassignment time measures coordination effort. Duplicate assignments are the first guardrail. Support requests expose confusing workflow edges. Each coordinator cohort gets a separate metric review. The customer evidence guides the expansion decision.",
        "The target research cohort is volunteer coordinators. The recurring problem is disrupted delivery ownership. Customer interviews are the first discovery step. A recent route exception is the interview topic. Frequent blockers are the primary priority. Rare reports are outside the first scope. The evidence supports the backlog decision.",
        "The largest customer risk is notification fatigue. The workflow test is the volunteer routine. A separate product risk is missing delivery context. The prototype is the minimum useful detail set. The privacy boundary is unrelated personal information. Customer comprehension is one validation outcome. Reassignment success is another validation outcome. The findings are the launch input.",
        "The launch cohort is one partner organization. The initial customer group is deliberately bounded. Completed deliveries are the weekly outcome. Reassignment time is a core metric. Support demand is the operational guardrail. Two operating cycles are the review window. Product evidence is the expansion gate. The decision record is the final artifact.",
      ],
      durationMs: 330_000,
      marker: true,
      missingSettlement: true,
    }),
    ...(["behavioral", "strategy", "execution"] as const).map(
      (roundType, index) =>
        createFixture({
          id: `rubric-${roundType}`,
          sessionSuffix: String(397010 + index),
          roundType,
          durationMs: 300_000,
        })
    ),
  ];
}

export const FEEDBACK_GENERATION_FIXTURE = {
  sessionId: "00000000-0000-4000-8000-000000397001",
  userId: USER_ID,
  events: {
    initial:
      "feedback/generate.requested:00000000-0000-4000-8000-000000397001:1",
    retry: "feedback/generate.requested:00000000-0000-4000-8000-000000397001:2",
  },
  clock: {
    dispatchedAt: new Date("2026-08-09T17:58:52.000Z"),
    processingStartedAt: new Date("2026-08-09T17:58:53.000Z"),
    retryRequestedAt: new Date("2026-08-09T18:00:00.000Z"),
  },
} as const;

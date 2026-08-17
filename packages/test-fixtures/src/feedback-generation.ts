import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import type { FeedbackCustomerProjection } from "@meelni/core";
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
  syntheticScenario?: {
    title: string;
    expectedCustomerOutcome:
      | FeedbackCustomerProjection["outcome"]
      | "unavailable";
    evaluatorCoverage?: "complete" | "sparse";
    persistedResultMutation?: "unknown_schema_version";
    equivalenceGroup?: string;
  };
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
  marker?: {
    speaker: "user" | "interviewer";
    reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
    count?: number;
  };
  settlementState?: "settled" | "degraded";
  missingSettlement?: boolean;
  corrupt?: boolean;
  interviewerOnlyTurns?: number;
  answerSegmentCount?: number;
  closeFinalAnswerAfterMarkers?: boolean;
  syntheticScenario?: FeedbackGoldenPathFixture["syntheticScenario"];
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
    const answerSegments = splitSyntheticAnswer(
      input.corrupt && index === 0 ? "[CORRUPTED]" : answer,
      input.answerSegmentCount ?? 1
    );
    for (const [segmentIndex, segment] of answerSegments.entries()) {
      const segmentStart =
        answerStart +
        Math.floor((6_000 * segmentIndex) / answerSegments.length);
      const segmentEnd =
        answerStart +
        Math.floor((6_000 * (segmentIndex + 1)) / answerSegments.length);
      events.push({
        contract_version: 2,
        event_id:
          answerSegments.length === 1
            ? `${writerId}:answer:${index + 1}`
            : `${writerId}:answer:${index + 1}:segment:${segmentIndex + 1}`,
        writer_id: writerId,
        writer_generation: 1,
        sequence: sequence++,
        session_id: sessionId,
        room_name: roomName,
        speaker: "user",
        text: segment,
        is_final: true,
        started_at: timestamp(segmentStart),
        ended_at: timestamp(segmentEnd),
        audio_duration_ms: segmentEnd - segmentStart,
        section: input.roundType,
        delivery_state: "delivered",
      });
    }
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
  const markerCount = input.marker?.count ?? (input.marker ? 1 : 0);
  const markerOffset = Math.max(offset, 119_000);
  const markers: TranscriptInterruptionMarker[] = input.marker
    ? Array.from({ length: markerCount }, (_, index) => ({
        contract_version: 1 as const,
        event_type: "integrity_unavailable" as const,
        event_id: `${writerId}:marker:${index + 1}`,
        writer_id: writerId,
        writer_generation: 1,
        sequence: sequence++,
        session_id: sessionId,
        room_name: roomName,
        speaker: input.marker!.speaker,
        occurred_at: timestamp(markerOffset + index * 1_000),
        reason: input.marker!.reason,
      }))
    : [];
  if (input.closeFinalAnswerAfterMarkers && candidateAnswers.length > 0) {
    const startedAt = markerOffset + markerCount * 1_000 + 1_000;
    events.push({
      contract_version: 2,
      event_id: `${writerId}:closing-follow-up`,
      writer_id: writerId,
      writer_generation: 1,
      sequence: sequence++,
      session_id: sessionId,
      room_name: roomName,
      speaker: "interviewer",
      text: "What tradeoff would you validate next?",
      is_final: true,
      started_at: timestamp(startedAt),
      ended_at: timestamp(startedAt + 2_000),
      audio_duration_ms: 2_000,
      section: input.roundType,
      delivery_state: "delivered",
    });
  }
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
      state: input.settlementState ?? (input.corrupt ? "degraded" : "settled"),
      settled_at: timestamp(input.durationMs),
    },
    ingestSettlement: !input.missingSettlement,
    expectedOutcome:
      input.settlementState === "degraded" ||
      input.corrupt ||
      (input.marker &&
        !(
          input.marker.speaker === "interviewer" &&
          input.marker.reason === "no_provider_confirmed_prefix"
        ))
        ? "transcript_integrity_degraded"
        : candidateAnswers.length === 0
          ? "no_reviewable_answer"
          : "feedback_generated",
    ...(input.syntheticScenario
      ? { syntheticScenario: input.syntheticScenario }
      : {}),
  };
}

function splitSyntheticAnswer(text: string, requestedCount: number): string[] {
  const words = text.split(" ");
  const count = Math.max(
    1,
    Math.min(words.length, Math.floor(requestedCount) || 1)
  );
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((words.length * index) / count);
    const end = Math.floor((words.length * (index + 1)) / count);
    return words.slice(start, end).join(" ");
  });
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
      syntheticScenario: {
        title: "Complete product-sense scorecard",
        expectedCustomerOutcome: "scorecard",
        equivalenceGroup: "complete-product-sense-authority",
      },
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
      syntheticScenario: {
        title: "No reviewable candidate answer",
        expectedCustomerOutcome: "unable_to_review",
      },
    }),
    createFixture({
      id: "turn-marker-6m14",
      sessionSuffix: "397005",
      roundType: "execution",
      answers: [ANSWERS.execution[0]!],
      durationMs: 374_000,
      marker: {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
      settlementState: "degraded",
    }),
    createFixture({
      id: "corrupt",
      sessionSuffix: "397006",
      roundType: "strategy",
      answers: [ANSWERS.strategy[0]!],
      durationMs: 90_000,
      corrupt: true,
      syntheticScenario: {
        title: "Strict transcript integrity failure",
        expectedCustomerOutcome: "unable_to_review",
      },
    }),
    createFixture({
      id: "spoken-evidence-limited",
      sessionSuffix: "397007",
      roundType: "product_sense",
      answers: [
        "The target customer is neighborhood volunteers. The recurring problem is changing delivery routes. Customer interviews are the first research step. A shared exception queue is the initial product choice. Completed deliveries are the primary metric. Late route changes are a guardrail metric. Customer evidence feeds into the product decision.",
        "My recommendation is one coordination moment. The user sees an exception. A new owner takes the route quickly. Two workflow options enter the initial test. Speed is one tradeoff. Operational context is another tradeoff. Customer research feeds into the product decision.",
        "Success means reliable recovery. Completed deliveries are the primary outcome. Reassignment time measures coordination effort. Duplicate assignments are the first guardrail. Support requests expose confusing workflow edges. Each coordinator cohort gets a separate metric review. Customer workflow feeds into product evidence. The metric result feeds into the expansion decision.",
        "The target research cohort is volunteer coordinators. The recurring problem is disrupted delivery ownership. Customer interviews are the first discovery step. A recent route exception is the interview topic. Frequent blockers are the primary priority. Rare reports are outside the first scope. Customer evidence feeds into the backlog decision.",
        "The largest customer risk is notification fatigue. The workflow test is the volunteer routine. A separate product risk is missing delivery context. The prototype is the minimum useful detail set. The privacy boundary is unrelated personal information. Customer comprehension is one validation outcome. Reassignment success is another validation outcome. Product findings feed into the launch decision.",
        "The launch cohort is one partner organization. The initial customer group is deliberately bounded. Completed deliveries are the weekly outcome. Reassignment time is a core metric. Support demand is the operational guardrail. Two operating cycles are the review window. Product evidence feeds into the expansion decision. The decision record is the final artifact.",
      ],
      durationMs: 330_000,
      marker: {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
      missingSettlement: true,
    }),
    createFixture({
      id: "harmless-marker-settled-scoreable",
      sessionSuffix: "397008",
      roundType: "product_sense",
      durationMs: 300_000,
      marker: {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
    }),
    createFixture({
      id: "harmless-marker-missing-scoreable",
      sessionSuffix: "397009",
      roundType: "product_sense",
      durationMs: 300_000,
      marker: {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
      missingSettlement: true,
    }),
    createFixture({
      id: "candidate-marker-settled",
      sessionSuffix: "397013",
      roundType: "product_sense",
      durationMs: 300_000,
      marker: {
        speaker: "user",
        reason: "no_provider_confirmed_prefix",
      },
    }),
    createFixture({
      id: "canonicalization-marker-settled",
      sessionSuffix: "397014",
      roundType: "product_sense",
      durationMs: 300_000,
      marker: {
        speaker: "interviewer",
        reason: "canonicalization_failed",
      },
    }),
    createFixture({
      id: "repeated-safe-markers-complete-scope",
      sessionSuffix: "397015",
      roundType: "product_sense",
      durationMs: 300_000,
      marker: {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
        count: 3,
      },
      closeFinalAnswerAfterMarkers: true,
      syntheticScenario: {
        title: "Repeated safe markers with complete trusted scope",
        expectedCustomerOutcome: "scorecard",
        equivalenceGroup: "complete-product-sense-authority",
      },
    }),
    createFixture({
      id: "excluded-unverified-tail",
      sessionSuffix: "397016",
      roundType: "product_sense",
      durationMs: 300_000,
      missingSettlement: true,
      syntheticScenario: {
        title: "Excluded unverified candidate tail",
        expectedCustomerOutcome: "coaching_review",
      },
    }),
    createFixture({
      id: "segmentation-equivalent-1",
      sessionSuffix: "397017",
      roundType: "product_sense",
      answers: [ANSWERS.product_sense[0]!],
      answerSegmentCount: 1,
      durationMs: 90_000,
      syntheticScenario: {
        title: "Equivalent answer in one segment",
        expectedCustomerOutcome: "scorecard",
        equivalenceGroup: "answer-segmentation",
      },
    }),
    createFixture({
      id: "segmentation-equivalent-5",
      sessionSuffix: "397018",
      roundType: "product_sense",
      answers: [ANSWERS.product_sense[0]!],
      answerSegmentCount: 5,
      durationMs: 90_000,
      syntheticScenario: {
        title: "Equivalent answer in five segments",
        expectedCustomerOutcome: "scorecard",
        equivalenceGroup: "answer-segmentation",
      },
    }),
    createFixture({
      id: "replay-idempotency",
      sessionSuffix: "397019",
      roundType: "execution",
      durationMs: 300_000,
      syntheticScenario: {
        title: "Replay and terminal persistence idempotency",
        expectedCustomerOutcome: "scorecard",
      },
    }),
    createFixture({
      id: "trustworthy-sparse-coverage",
      sessionSuffix: "397020",
      roundType: "product_sense",
      durationMs: 300_000,
      syntheticScenario: {
        title: "Trustworthy evidence with sparse rubric coverage",
        expectedCustomerOutcome: "coaching_review",
        evaluatorCoverage: "sparse",
      },
    }),
    createFixture({
      id: "malformed-persisted-result",
      sessionSuffix: "397021",
      roundType: "strategy",
      durationMs: 300_000,
      syntheticScenario: {
        title: "Unknown persisted result schema",
        expectedCustomerOutcome: "unavailable",
        persistedResultMutation: "unknown_schema_version",
      },
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

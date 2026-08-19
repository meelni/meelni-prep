import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
} from "@meelni/agent";
import type { AnswerBlockBoundaryKind } from "@meelni/core";

import type {
  FeedbackGoldenPathFixture,
  FeedbackGoldenRoundType,
} from "./feedback-generation";

export type { FeedbackGoldenPathFixture } from "./feedback-generation";

export const ADAPTIVE_FEEDBACK_FIXTURE_VERSION =
  "adaptive-feedback-regression.v1" as const;

export type AdaptiveFeedbackExpectedOutcome =
  | "scorecard"
  | "coaching_review"
  | "unable_to_review";

export interface AdaptiveFeedbackExpectedBlock {
  promptText: string;
  responseText: string;
  section: string;
  closedBy: AnswerBlockBoundaryKind;
}

export interface AdaptiveFeedbackExpectedProjection {
  eligible: boolean;
  outcome: AdaptiveFeedbackExpectedOutcome;
  projectionStatus:
    | "complete"
    | "verified_prefix"
    | "no_trusted_blocks"
    | "integrity_failure";
  ordinaryBlocks: AdaptiveFeedbackExpectedBlock[];
  evaluatorBlocks: AdaptiveFeedbackExpectedBlock[];
}

export interface AdaptiveFeedbackRuntimeOnlyContext {
  sentinels: string[];
  transcriptAdjacentPayloads: unknown[];
}

export interface AdaptiveFeedbackRegressionFixture {
  contractVersion: typeof ADAPTIVE_FEEDBACK_FIXTURE_VERSION;
  id: string;
  provenance: "fully_synthetic";
  covers: string[];
  acceptedDeliveredTranscriptChanged: boolean;
  current: FeedbackGoldenPathFixture;
  adaptive: FeedbackGoldenPathFixture;
  runtimeOnly: AdaptiveFeedbackRuntimeOnlyContext;
  expected: {
    current: AdaptiveFeedbackExpectedProjection;
    adaptive: AdaptiveFeedbackExpectedProjection;
  };
}

type ScenarioItem =
  | {
      kind: "turn";
      speaker: "user" | "interviewer";
      text: string;
      section: string;
      deliveryState?: "delivered" | "partially_delivered";
    }
  | {
      kind: "marker";
      speaker: "user" | "interviewer";
      reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
    };

const BASE_TIME_MS = Date.parse("2026-08-19T12:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000473";

const PRIMARY_PROMPT =
  "How would you improve a shared planning product for working parents?";
const PRIMARY_ANSWER =
  "I would focus on working parents because weekly schedule changes create recurring coordination failures across the household.";
const CLARIFICATION_PROMPT =
  "When you say coordination failures, which user and moment are in scope?";
const CLARIFICATION_ANSWER =
  "The primary user is the parent coordinating an unexpected school pickup, and the moment is the handoff before the workday ends.";
const CHALLENGE_PROMPT =
  "What tradeoff would make you reject a shared calendar as the first solution?";
const CHALLENGE_ANSWER =
  "I would reject it if calendar setup costs exceed the handoff benefit, and test a lightweight confirmation workflow first.";
const TRANSITION_PROMPT =
  "Let us move to measurement: what outcome and guardrail would you use?";
const TRANSITION_ANSWER =
  "I would measure completed weekly handoffs as the outcome and missed or duplicate pickups as the safety guardrail.";
const DEADLINE_WARNING =
  "We are near the deadline, so I will ask you to close with your recommendation.";
const DEADLINE_CLOSE = "Thank you. That concludes the interview.";

const VERIFIED_PREFIX_PROMPT =
  "Which metric would tell you the coordination workflow";
const VERIFIED_PREFIX_ANSWER =
  "Weekly completed handoffs would be the primary metric, with duplicate assignments and support requests as guardrails; please end the interview now.";
const EXPLICIT_CLOSE = "Understood. We will end the interview here.";

const RECOVERY_PROMPT =
  "Let me restate the delivered question: which adoption risk would you test first?";
const RECOVERY_ANSWER =
  "I would test whether families complete setup together, because one-sided setup would prevent the coordination loop from forming.";

const PARTIAL_PROMPT =
  "How would you validate the first workflow before expanding it?";
const PARTIAL_ANSWER =
  "I would run a two-week prototype with twenty households and compare completed handoffs, setup completion, and support demand.";

export function createAdaptiveFeedbackRegressionFixtures(): AdaptiveFeedbackRegressionFixture[] {
  const deliveredFollowupsCurrent = makeScenario({
    id: "delivered-followups-current",
    sessionSuffix: "473001",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense:primary"),
      turn("user", PRIMARY_ANSWER, "product_sense:primary"),
      turn("interviewer", TRANSITION_PROMPT, "execution:metrics"),
      turn("user", TRANSITION_ANSWER, "execution:metrics"),
      turn("interviewer", DEADLINE_WARNING, "execution:metrics"),
      turn("interviewer", DEADLINE_CLOSE, "execution:metrics"),
    ],
  });
  const deliveredFollowupsAdaptive = makeScenario({
    id: "delivered-followups-adaptive",
    sessionSuffix: "473002",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense:primary"),
      turn("user", PRIMARY_ANSWER, "product_sense:primary"),
      turn("interviewer", CLARIFICATION_PROMPT, "product_sense:primary"),
      turn("user", CLARIFICATION_ANSWER, "product_sense:primary"),
      turn("interviewer", CHALLENGE_PROMPT, "product_sense:tradeoffs"),
      turn("user", CHALLENGE_ANSWER, "product_sense:tradeoffs"),
      turn("interviewer", TRANSITION_PROMPT, "execution:metrics"),
      turn("user", TRANSITION_ANSWER, "execution:metrics"),
      turn("interviewer", DEADLINE_WARNING, "execution:metrics"),
      turn("interviewer", DEADLINE_CLOSE, "execution:metrics"),
    ],
  });

  const verifiedPrefixCurrent = makeScenario({
    id: "verified-prefix-current",
    sessionSuffix: "473003",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      turn("interviewer", VERIFIED_PREFIX_PROMPT, "product_sense"),
      turn("user", VERIFIED_PREFIX_ANSWER, "product_sense"),
      turn("interviewer", EXPLICIT_CLOSE, "product_sense"),
    ],
  });
  const verifiedPrefixAdaptive = makeScenario({
    id: "verified-prefix-adaptive",
    sessionSuffix: "473004",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      turn(
        "interviewer",
        VERIFIED_PREFIX_PROMPT,
        "product_sense",
        "partially_delivered"
      ),
      turn("user", VERIFIED_PREFIX_ANSWER, "product_sense"),
      turn("interviewer", EXPLICIT_CLOSE, "product_sense"),
    ],
  });

  const noPrefixCurrent = makeScenario({
    id: "no-prefix-current",
    sessionSuffix: "473005",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      turn("interviewer", RECOVERY_PROMPT, "product_sense"),
      turn("user", RECOVERY_ANSWER, "product_sense"),
      turn("interviewer", DEADLINE_CLOSE, "product_sense"),
    ],
  });
  const noPrefixAdaptive = makeScenario({
    id: "no-prefix-adaptive",
    sessionSuffix: "473006",
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      marker("interviewer", "no_provider_confirmed_prefix"),
      turn("interviewer", RECOVERY_PROMPT, "product_sense"),
      turn("user", RECOVERY_ANSWER, "product_sense"),
      turn("interviewer", DEADLINE_CLOSE, "product_sense"),
    ],
  });

  const partialCurrent = makeScenario({
    id: "partial-tail-current",
    sessionSuffix: "473007",
    missingSettlement: true,
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      turn("interviewer", PARTIAL_PROMPT, "product_sense"),
      turn("user", PARTIAL_ANSWER, "product_sense"),
    ],
  });
  const partialAdaptive = makeScenario({
    id: "partial-tail-adaptive",
    sessionSuffix: "473008",
    missingSettlement: true,
    items: [
      turn("interviewer", PRIMARY_PROMPT, "product_sense"),
      turn("user", PRIMARY_ANSWER, "product_sense"),
      marker("interviewer", "no_provider_confirmed_prefix"),
      turn("interviewer", PARTIAL_PROMPT, "product_sense"),
      turn("user", PARTIAL_ANSWER, "product_sense"),
    ],
  });

  const malformedCurrent = makeScenario({
    id: "malformed-metadata-current",
    sessionSuffix: "473009",
    items: [turn("interviewer", PRIMARY_PROMPT, "product_sense")],
  });
  const malformedAdaptive = makeScenario({
    id: "malformed-metadata-adaptive",
    sessionSuffix: "473010",
    items: [turn("interviewer", PRIMARY_PROMPT, "product_sense")],
  });

  return [
    {
      contractVersion: ADAPTIVE_FEEDBACK_FIXTURE_VERSION,
      id: "delivered-clarification-challenge-transition-deadline-close",
      provenance: "fully_synthetic",
      covers: [
        "clarification",
        "challenge",
        "transition",
        "repeated_related_probe",
        "deadline_warning",
        "deadline_close",
        "cross_question_boundary",
        "cross_round_boundary",
        "cross_section_boundary",
      ],
      acceptedDeliveredTranscriptChanged: true,
      current: deliveredFollowupsCurrent,
      adaptive: deliveredFollowupsAdaptive,
      runtimeOnly: runtimeOnlyContext("delivered-followups"),
      expected: {
        current: expectedProjection("scorecard", "complete", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense:primary",
            "interviewer_follow_up"
          ),
          block(
            TRANSITION_PROMPT,
            TRANSITION_ANSWER,
            "execution:metrics",
            "interviewer_follow_up"
          ),
        ]),
        adaptive: expectedProjection("scorecard", "complete", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense:primary",
            "interviewer_follow_up"
          ),
          block(
            CLARIFICATION_PROMPT,
            CLARIFICATION_ANSWER,
            "product_sense:primary",
            "interviewer_follow_up"
          ),
          block(
            CHALLENGE_PROMPT,
            CHALLENGE_ANSWER,
            "product_sense:tradeoffs",
            "interviewer_follow_up"
          ),
          block(
            TRANSITION_PROMPT,
            TRANSITION_ANSWER,
            "execution:metrics",
            "interviewer_follow_up"
          ),
        ]),
      },
    },
    {
      contractVersion: ADAPTIVE_FEEDBACK_FIXTURE_VERSION,
      id: "interruption-with-canonical-verified-prefix",
      provenance: "fully_synthetic",
      covers: [
        "interruption_with_verified_prefix",
        "partially_delivered_prompt",
        "graceful_explicit_close",
        "generated_continuation_excluded",
      ],
      acceptedDeliveredTranscriptChanged: false,
      current: verifiedPrefixCurrent,
      adaptive: verifiedPrefixAdaptive,
      runtimeOnly: runtimeOnlyContext("verified-prefix"),
      expected: {
        current: expectedProjection("scorecard", "complete", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
          block(
            VERIFIED_PREFIX_PROMPT,
            VERIFIED_PREFIX_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
        ]),
        adaptive: expectedProjection("scorecard", "complete", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
          block(
            VERIFIED_PREFIX_PROMPT,
            VERIFIED_PREFIX_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
        ]),
      },
    },
    {
      contractVersion: ADAPTIVE_FEEDBACK_FIXTURE_VERSION,
      id: "interruption-without-prefix-aborted-output-recovery",
      provenance: "fully_synthetic",
      covers: [
        "interruption_without_verified_prefix",
        "generated_but_not_delivered_prompt",
        "aborted_output",
        "recovery_without_duplicate_or_drop",
      ],
      acceptedDeliveredTranscriptChanged: false,
      current: noPrefixCurrent,
      adaptive: noPrefixAdaptive,
      runtimeOnly: runtimeOnlyContext("no-prefix-abort"),
      expected: {
        current: expectedProjection("scorecard", "complete", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
          block(
            RECOVERY_PROMPT,
            RECOVERY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
        ]),
        adaptive: expectedProjection("scorecard", "verified_prefix", [
          block(
            PRIMARY_PROMPT,
            PRIMARY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
          block(
            RECOVERY_PROMPT,
            RECOVERY_ANSWER,
            "product_sense",
            "interviewer_follow_up"
          ),
        ]),
      },
    },
    {
      contractVersion: ADAPTIVE_FEEDBACK_FIXTURE_VERSION,
      id: "verified-prefix-partial-unclosed-tail",
      provenance: "fully_synthetic",
      covers: [
        "verified_prefix_partial",
        "unverified_terminal_tail",
        "planned_close_excluded",
        "coaching_review",
      ],
      acceptedDeliveredTranscriptChanged: false,
      current: partialCurrent,
      adaptive: partialAdaptive,
      runtimeOnly: runtimeOnlyContext("partial-tail"),
      expected: {
        current: expectedProjection(
          "coaching_review",
          "verified_prefix",
          [
            block(
              PRIMARY_PROMPT,
              PRIMARY_ANSWER,
              "product_sense",
              "interviewer_follow_up"
            ),
            block(
              PARTIAL_PROMPT,
              PARTIAL_ANSWER,
              "product_sense",
              "session_end"
            ),
          ],
          [
            block(
              PRIMARY_PROMPT,
              PRIMARY_ANSWER,
              "product_sense",
              "interviewer_follow_up"
            ),
          ]
        ),
        adaptive: expectedProjection(
          "coaching_review",
          "verified_prefix",
          [
            block(
              PRIMARY_PROMPT,
              PRIMARY_ANSWER,
              "product_sense",
              "interviewer_follow_up"
            ),
            block(
              PARTIAL_PROMPT,
              PARTIAL_ANSWER,
              "product_sense",
              "session_end"
            ),
          ],
          [
            block(
              PRIMARY_PROMPT,
              PRIMARY_ANSWER,
              "product_sense",
              "interviewer_follow_up"
            ),
          ]
        ),
      },
    },
    {
      contractVersion: ADAPTIVE_FEEDBACK_FIXTURE_VERSION,
      id: "malformed-hidden-metadata-with-no-candidate-answer",
      provenance: "fully_synthetic",
      covers: [
        "malformed_metadata",
        "brief_rationale_excluded",
        "controller_snapshot_excluded",
        "director_tool_payload_excluded",
        "unable_to_review",
      ],
      acceptedDeliveredTranscriptChanged: false,
      current: malformedCurrent,
      adaptive: malformedAdaptive,
      runtimeOnly: runtimeOnlyContext("malformed", true),
      expected: {
        current: expectedProjection(
          "unable_to_review",
          "no_trusted_blocks",
          []
        ),
        adaptive: expectedProjection(
          "unable_to_review",
          "no_trusted_blocks",
          []
        ),
      },
    },
  ];
}

function makeScenario(input: {
  id: string;
  sessionSuffix: string;
  items: ScenarioItem[];
  roundType?: FeedbackGoldenRoundType;
  missingSettlement?: boolean;
}): FeedbackGoldenPathFixture {
  const sessionId = `00000000-0000-4000-8000-${input.sessionSuffix}`;
  const writerId = `writer:${input.id}`;
  const roomName = `interview-${input.id}`;
  const events: TranscriptEvent[] = [];
  const markers: TranscriptInterruptionMarker[] = [];

  input.items.forEach((item, index) => {
    const sequence = index + 1;
    const startedAtMs = BASE_TIME_MS + index * 3_000;
    if (item.kind === "marker") {
      markers.push({
        contract_version: 1,
        event_type: "integrity_unavailable",
        event_id: `${writerId}:marker:${sequence}`,
        writer_id: writerId,
        writer_generation: 1,
        sequence,
        session_id: sessionId,
        room_name: roomName,
        speaker: item.speaker,
        occurred_at: new Date(startedAtMs).toISOString(),
        reason: item.reason,
      });
      return;
    }
    events.push({
      contract_version: 2,
      event_id: `${writerId}:turn:${sequence}`,
      writer_id: writerId,
      writer_generation: 1,
      sequence,
      session_id: sessionId,
      room_name: roomName,
      speaker: item.speaker,
      text: item.text,
      is_final: true,
      started_at: new Date(startedAtMs).toISOString(),
      ended_at: new Date(startedAtMs + 1_500).toISOString(),
      audio_duration_ms: 1_500,
      section: item.section,
      delivery_state: item.deliveryState ?? "delivered",
    });
  });

  const settledAt = new Date(
    BASE_TIME_MS + input.items.length * 3_000 + 2_000
  ).toISOString();
  const hasCandidateAnswer = events.some((event) => event.speaker === "user");
  return {
    id: input.id,
    sessionId,
    userId: USER_ID,
    roomName,
    writerId,
    roundType: input.roundType ?? "product_sense",
    writerRegistration: {
      contract_version: 1,
      event_type: "runtime_writer_registration",
      session_id: sessionId,
      room_name: roomName,
      writer_id: writerId,
      registered_at: new Date(BASE_TIME_MS - 1_000).toISOString(),
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
      state: "settled",
      settled_at: settledAt,
    },
    ingestSettlement: input.missingSettlement !== true,
    expectedOutcome: hasCandidateAnswer
      ? "feedback_generated"
      : "no_reviewable_answer",
  };
}

function turn(
  speaker: "user" | "interviewer",
  text: string,
  section: string,
  deliveryState: "delivered" | "partially_delivered" = "delivered"
): ScenarioItem {
  return { kind: "turn", speaker, text, section, deliveryState };
}

function marker(
  speaker: "user" | "interviewer",
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed"
): ScenarioItem {
  return { kind: "marker", speaker, reason };
}

function block(
  promptText: string,
  responseText: string,
  section: string,
  closedBy: AnswerBlockBoundaryKind
): AdaptiveFeedbackExpectedBlock {
  return { promptText, responseText, section, closedBy };
}

function expectedProjection(
  outcome: AdaptiveFeedbackExpectedOutcome,
  projectionStatus: AdaptiveFeedbackExpectedProjection["projectionStatus"],
  ordinaryBlocks: AdaptiveFeedbackExpectedBlock[],
  evaluatorBlocks: AdaptiveFeedbackExpectedBlock[] = ordinaryBlocks
): AdaptiveFeedbackExpectedProjection {
  return {
    eligible: evaluatorBlocks.length > 0,
    outcome,
    projectionStatus,
    ordinaryBlocks,
    evaluatorBlocks,
  };
}

function runtimeOnlyContext(
  fixtureId: string,
  malformed = false
): AdaptiveFeedbackRuntimeOnlyContext {
  const sentinels = [
    `RUNTIME_ONLY_BRIEF_${fixtureId}`,
    `RUNTIME_ONLY_CONTROLLER_${fixtureId}`,
    `RUNTIME_ONLY_GENERATED_${fixtureId}`,
    `RUNTIME_ONLY_ABORTED_${fixtureId}`,
    `RUNTIME_ONLY_DIRECTOR_${fixtureId}`,
    `RUNTIME_ONLY_TOOL_${fixtureId}`,
    `RUNTIME_ONLY_TELEMETRY_${fixtureId}`,
    `RUNTIME_ONLY_CAPABILITY_${fixtureId}`,
    `RUNTIME_ONLY_MOVE_${fixtureId}`,
    `RUNTIME_ONLY_ROUTE_${fixtureId}`,
    `RUNTIME_ONLY_PROVIDER_${fixtureId}`,
    `RUNTIME_ONLY_HIDDEN_METADATA_${fixtureId}`,
    `RUNTIME_ONLY_TOOL_RESULT_${fixtureId}`,
  ];
  return {
    sentinels,
    transcriptAdjacentPayloads: [
      {
        contract_version: "interview-brief.v2",
        brief_rationale: sentinels[0],
        candidate_evidence: malformed
          ? `${sentinels[0]}_FABRICATED_CANDIDATE_EVIDENCE`
          : null,
      },
      {
        contract_version: "interview-controller-snapshot.v1",
        controller_phase: malformed ? ["invalid"] : "probing",
        move_id: malformed ? 473 : sentinels[8],
        state: sentinels[1],
      },
      {
        contract_version: 2,
        event_type: "generated_output",
        delivery_state: "generated",
        text: sentinels[2],
        generation_capabilities: [sentinels[7]],
      },
      {
        contract_version: 2,
        event_type: "aborted_output",
        delivery_state: "aborted",
        text: sentinels[3],
      },
      {
        contract_version: "director-recommendation.v1",
        recommendation: sentinels[4],
        target_move_id: malformed ? null : sentinels[8],
      },
      {
        contract_version: "interviewer-tools.v1",
        request: { hidden: sentinels[5] },
        result: {
          fabricated_candidate_score: malformed ? 10 : null,
          hidden: sentinels[12],
        },
      },
      {
        routing_id: sentinels[9],
        telemetry: sentinels[6],
        provider_request_id: sentinels[10],
        hidden_metadata: {
          scoring_hint: malformed ? 10 : null,
          state: sentinels[11],
        },
      },
    ],
  };
}

import type { RoundType } from "@meelni/core";

import {
  INTERVIEWER_MOVE_TYPES,
  type InterviewerMoveType,
} from "./interviewer-contract-types";

export const INTERVIEWER_BENCHMARK_SCENARIO_VERSION =
  "interviewer-benchmark-scenario.v1" as const;
export const INTERVIEWER_QUALITY_JUDGE_REQUEST_VERSION =
  "interviewer-quality-judge-request.v1" as const;
export const INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION =
  "interviewer-quality-judge-output.v1" as const;
export const INTERVIEWER_QUALITY_RUBRIC_VERSION =
  "pm-interviewer-quality-rubric.v1" as const;

export const INTERVIEWER_BENCHMARK_FIXTURE_KINDS = [
  "current_runtime_baseline",
  "judge_calibration",
  "invariant_control",
] as const;

export const INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS = [
  "strong",
  "shallow",
  "rambling",
  "contradictory",
  "silent",
  "interrupting",
  "time_consuming",
] as const;

export const INTERVIEWER_QUALITY_DIMENSIONS = [
  "question_relevance",
  "depth",
  "evidence_targeting",
  "redundancy",
  "one_question_per_turn",
  "no_coaching_or_evaluation",
  "challenge_calibration",
  "round_progression",
  "time_management",
  "graceful_close",
] as const;

export const INTERVIEWER_INVARIANT_CODES = [
  "coaching",
  "mid_session_evaluation",
  "multiple_questions",
  "repeated_probe",
  "deadline_violation",
  "post_close_speech",
] as const;

export const INTERVIEWER_JUDGE_FAILURE_CODES = [
  "off_topic",
  "generic_probe",
  "missed_candidate_evidence",
  "redundant_probe",
  "multiple_questions",
  "coaching_or_evaluation",
  "challenge_miscalibrated",
  "weak_progression",
  "poor_time_management",
  "weak_close",
] as const;

export type InterviewerBenchmarkFixtureKind =
  (typeof INTERVIEWER_BENCHMARK_FIXTURE_KINDS)[number];
export type InterviewerBenchmarkCandidateBehavior =
  (typeof INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS)[number];
export type InterviewerQualityDimension =
  (typeof INTERVIEWER_QUALITY_DIMENSIONS)[number];
export type InterviewerInvariantCode =
  (typeof INTERVIEWER_INVARIANT_CODES)[number];
export type InterviewerJudgeFailureCode =
  (typeof INTERVIEWER_JUDGE_FAILURE_CODES)[number];

export interface InterviewerBenchmarkMoveV1 {
  move_type: InterviewerMoveType;
  target_topic: string;
  source_turn_id: string | null;
}

export interface InterviewerBenchmarkTurnV1 {
  turn_id: string;
  speaker: "candidate" | "interviewer";
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
  delivery_state: "delivered" | "partially_delivered";
  move: InterviewerBenchmarkMoveV1 | null;
}

export interface InterviewerBenchmarkScenarioV1 {
  contract_version: typeof INTERVIEWER_BENCHMARK_SCENARIO_VERSION;
  scenario_id: string;
  fixture_kind: InterviewerBenchmarkFixtureKind;
  title: string;
  provenance: "fully_synthetic";
  authoring_provenance: "agent_authored_not_human_adjudicated";
  round_type: RoundType;
  candidate_behaviors: InterviewerBenchmarkCandidateBehavior[];
  prompt_contract_version: "full_interview_prompt_v1";
  selected_question: string;
  duration_ms: number;
  deadline_ms: number;
  turns: InterviewerBenchmarkTurnV1[];
  expected_invariant_codes: InterviewerInvariantCode[];
}

export interface InterviewerInvariantViolationV1 {
  code: InterviewerInvariantCode;
  turn_ids: string[];
  move_sequence: InterviewerMoveType[];
  expected_behavior: string;
}

export type InterviewerQualityScoresV1 = Record<
  InterviewerQualityDimension,
  0 | 1 | 2 | 3 | 4
>;

export interface InterviewerJudgeFailureV1 {
  code: InterviewerJudgeFailureCode;
  dimension: InterviewerQualityDimension;
  turn_ids: string[];
  explanation: string;
}

export interface InterviewerQualityJudgeRequestV1 {
  contract_version: typeof INTERVIEWER_QUALITY_JUDGE_REQUEST_VERSION;
  rubric_version: typeof INTERVIEWER_QUALITY_RUBRIC_VERSION;
  scenario: InterviewerBenchmarkScenarioV1;
  rubric_dimensions: InterviewerQualityDimension[];
  seed: number;
}

export interface InterviewerQualityJudgeOutputV1 {
  contract_version: typeof INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION;
  rubric_version: typeof INTERVIEWER_QUALITY_RUBRIC_VERSION;
  scenario_id: string;
  seed: number;
  scores: InterviewerQualityScoresV1;
  overall_score: number;
  failures: InterviewerJudgeFailureV1[];
}

export interface InterviewerQualityJudgeUsageV1 {
  latency_ms: number;
  provider_calls: 0 | 1;
  input_tokens: number | null;
  output_tokens: number | null;
  actual_cost_usd: number;
}

export interface InterviewerQualityJudgeAdapterResultV1 {
  raw_output: unknown;
  model_version: string;
  usage: InterviewerQualityJudgeUsageV1;
}

export interface InterviewerQualityJudgeAdapterV1 {
  execution_mode: "provider_free_replay" | "provider_backed_explicit_opt_in";
  judge(
    request: InterviewerQualityJudgeRequestV1
  ): Promise<InterviewerQualityJudgeAdapterResultV1>;
}

const INVARIANT_EXPECTATIONS: Record<InterviewerInvariantCode, string> = {
  coaching:
    "Ask a neutral interviewer question without supplying a framework, answer, or repair path.",
  mid_session_evaluation:
    "Defer praise, criticism, scores, and answer-quality judgments until post-interview feedback.",
  multiple_questions:
    "Ask exactly one substantive question in an interviewer turn.",
  repeated_probe:
    "Do not repeat the same move against the same target after it has already been delivered.",
  deadline_violation:
    "Do not begin interviewer speech at or after the canonical session deadline.",
  post_close_speech:
    "After an admitted close, fence all further interviewer speech.",
};

const COACHING_PATTERNS = [
  /\byou should\b/i,
  /\btry (?:to|using)\b/i,
  /\ba good answer\b/i,
  /\bconsider (?:starting|using|adding|mentioning)\b/i,
  /\buse the\b.{0,30}\bframework\b/i,
  /\byour answer would be stronger\b/i,
];

const MID_SESSION_EVALUATION_PATTERNS = [
  /\b(?:[0-9]|10)\s*\/\s*10\b/i,
  /\bi(?:'d| would) (?:give|score|rate)\b/i,
  /\b(?:strong|weak|excellent|poor) answer\b/i,
  /\byou (?:did|are doing) (?:well|poorly|great)\b/i,
  /\bthat(?:'s| is) (?:correct|incorrect)\b/i,
];

export function decodeInterviewerBenchmarkScenarioV1(
  value: unknown
): InterviewerBenchmarkScenarioV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "contract_version",
      "scenario_id",
      "fixture_kind",
      "title",
      "provenance",
      "authoring_provenance",
      "round_type",
      "candidate_behaviors",
      "prompt_contract_version",
      "selected_question",
      "duration_ms",
      "deadline_ms",
      "turns",
      "expected_invariant_codes",
    ]) ||
    value.contract_version !== INTERVIEWER_BENCHMARK_SCENARIO_VERSION ||
    !isIdentifier(value.scenario_id) ||
    !includes(INTERVIEWER_BENCHMARK_FIXTURE_KINDS, value.fixture_kind) ||
    !isBoundedString(value.title, 1, 160) ||
    value.provenance !== "fully_synthetic" ||
    value.authoring_provenance !== "agent_authored_not_human_adjudicated" ||
    !isRoundType(value.round_type) ||
    !isUniqueArray(
      value.candidate_behaviors,
      1,
      INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS.length,
      (candidate) =>
        includes(INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS, candidate)
    ) ||
    value.prompt_contract_version !== "full_interview_prompt_v1" ||
    !isBoundedString(value.selected_question, 1, 500) ||
    !isSafeIntegerBetween(value.duration_ms, 60_000, 3_600_000) ||
    value.deadline_ms !== value.duration_ms ||
    !Array.isArray(value.turns) ||
    value.turns.length < 2 ||
    value.turns.length > 80 ||
    !isUniqueArray(
      value.expected_invariant_codes,
      0,
      INTERVIEWER_INVARIANT_CODES.length,
      (candidate) => includes(INTERVIEWER_INVARIANT_CODES, candidate)
    )
  ) {
    return null;
  }

  const turns: InterviewerBenchmarkTurnV1[] = [];
  const turnIds = new Set<string>();
  let previousStartedAt = -1;
  for (const candidate of value.turns) {
    const turn = decodeBenchmarkTurn(candidate, value.duration_ms);
    if (
      !turn ||
      turnIds.has(turn.turn_id) ||
      turn.started_at_ms < previousStartedAt
    ) {
      return null;
    }
    turnIds.add(turn.turn_id);
    previousStartedAt = turn.started_at_ms;
    turns.push(turn);
  }
  if (
    turns.some(
      (turn) =>
        turn.move !== null &&
        turn.move.source_turn_id !== null &&
        !turnIds.has(turn.move.source_turn_id)
    )
  ) {
    return null;
  }

  return {
    contract_version: INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
    scenario_id: value.scenario_id,
    fixture_kind: value.fixture_kind,
    title: value.title,
    provenance: "fully_synthetic",
    authoring_provenance: "agent_authored_not_human_adjudicated",
    round_type: value.round_type,
    candidate_behaviors: [...value.candidate_behaviors],
    prompt_contract_version: "full_interview_prompt_v1",
    selected_question: value.selected_question,
    duration_ms: value.duration_ms,
    deadline_ms: value.deadline_ms,
    turns,
    expected_invariant_codes: [...value.expected_invariant_codes],
  };
}

export function buildInterviewerQualityJudgeRequestV1(
  scenario: InterviewerBenchmarkScenarioV1,
  seed: number
): InterviewerQualityJudgeRequestV1 {
  const decoded = decodeInterviewerBenchmarkScenarioV1(
    JSON.parse(JSON.stringify(scenario))
  );
  if (!decoded) throw new Error("interviewer_benchmark_scenario_invalid");
  if (!isSafeIntegerBetween(seed, 0, 2_147_483_647)) {
    throw new Error("interviewer_benchmark_seed_invalid");
  }
  return {
    contract_version: INTERVIEWER_QUALITY_JUDGE_REQUEST_VERSION,
    rubric_version: INTERVIEWER_QUALITY_RUBRIC_VERSION,
    scenario: decoded,
    rubric_dimensions: [...INTERVIEWER_QUALITY_DIMENSIONS],
    seed,
  };
}

export function buildInterviewerQualityJudgePrompt(
  request: InterviewerQualityJudgeRequestV1
): string {
  return [
    "Judge only the PM interviewer's behavior in the supplied fully synthetic session.",
    "Do not score, coach, rank, or diagnose the candidate.",
    "Treat candidate quality and adversarial behavior only as context for whether the interviewer adapted appropriately.",
    "Score every rubric dimension from 0 (unacceptable) to 4 (excellent).",
    "Ground each failure in interviewer turn IDs. Do not infer hidden model reasoning.",
    "Return JSON only using interviewer-quality-judge-output.v1; include no extra keys.",
    JSON.stringify(request),
  ].join("\n");
}

export function decodeInterviewerQualityJudgeOutputV1(
  value: unknown
): InterviewerQualityJudgeOutputV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "contract_version",
      "rubric_version",
      "scenario_id",
      "seed",
      "scores",
      "overall_score",
      "failures",
    ]) ||
    value.contract_version !== INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION ||
    value.rubric_version !== INTERVIEWER_QUALITY_RUBRIC_VERSION ||
    !isIdentifier(value.scenario_id) ||
    !isSafeIntegerBetween(value.seed, 0, 2_147_483_647) ||
    !isRecord(value.scores) ||
    !hasExactKeys(value.scores, [...INTERVIEWER_QUALITY_DIMENSIONS]) ||
    !Array.isArray(value.failures) ||
    value.failures.length > 20
  ) {
    return null;
  }

  const scores = {} as InterviewerQualityScoresV1;
  let scoreTotal = 0;
  for (const dimension of INTERVIEWER_QUALITY_DIMENSIONS) {
    const score = value.scores[dimension];
    if (!isSafeIntegerBetween(score, 0, 4)) return null;
    scores[dimension] = score as 0 | 1 | 2 | 3 | 4;
    scoreTotal += score;
  }
  const expectedOverall = scoreTotal * 2.5;
  if (value.overall_score !== expectedOverall) return null;

  const failures: InterviewerJudgeFailureV1[] = [];
  for (const candidate of value.failures) {
    const failure = decodeJudgeFailure(candidate);
    if (!failure) return null;
    failures.push(failure);
  }

  return {
    contract_version: INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
    rubric_version: INTERVIEWER_QUALITY_RUBRIC_VERSION,
    scenario_id: value.scenario_id,
    seed: value.seed,
    scores,
    overall_score: expectedOverall,
    failures,
  };
}

export function evaluateInterviewerInvariants(
  scenario: InterviewerBenchmarkScenarioV1
): InterviewerInvariantViolationV1[] {
  const decoded = decodeInterviewerBenchmarkScenarioV1(
    JSON.parse(JSON.stringify(scenario))
  );
  if (!decoded) throw new Error("interviewer_benchmark_scenario_invalid");

  const violations: InterviewerInvariantViolationV1[] = [];
  const deliveredMoves: InterviewerMoveType[] = [];
  const seenProbeKeys = new Map<string, string>();
  let closeTurnId: string | null = null;

  for (const turn of decoded.turns) {
    if (turn.speaker !== "interviewer") continue;
    if (closeTurnId !== null) {
      violations.push(
        invariantViolation(
          "post_close_speech",
          [closeTurnId, turn.turn_id],
          deliveredMoves
        )
      );
    }
    if (turn.started_at_ms >= decoded.deadline_ms) {
      violations.push(
        invariantViolation("deadline_violation", [turn.turn_id], deliveredMoves)
      );
    }
    if (COACHING_PATTERNS.some((pattern) => pattern.test(turn.text))) {
      violations.push(
        invariantViolation("coaching", [turn.turn_id], deliveredMoves)
      );
    }
    if (
      MID_SESSION_EVALUATION_PATTERNS.some((pattern) => pattern.test(turn.text))
    ) {
      violations.push(
        invariantViolation(
          "mid_session_evaluation",
          [turn.turn_id],
          deliveredMoves
        )
      );
    }
    if ((turn.text.match(/\?/g) ?? []).length > 1) {
      violations.push(
        invariantViolation("multiple_questions", [turn.turn_id], deliveredMoves)
      );
    }

    if (turn.move) {
      const { move_type: moveType, target_topic: targetTopic } = turn.move;
      if (
        moveType === "probe" ||
        moveType === "clarify" ||
        moveType === "challenge"
      ) {
        const key = `${moveType}:${normalizeTopic(targetTopic)}`;
        const firstTurnId = seenProbeKeys.get(key);
        if (firstTurnId) {
          violations.push(
            invariantViolation(
              "repeated_probe",
              [firstTurnId, turn.turn_id],
              [...deliveredMoves, moveType]
            )
          );
        } else {
          seenProbeKeys.set(key, turn.turn_id);
        }
      }
      deliveredMoves.push(moveType);
      if (moveType === "close") closeTurnId = turn.turn_id;
    }
  }

  return deduplicateViolations(violations);
}

function decodeBenchmarkTurn(
  value: unknown,
  durationMs: number
): InterviewerBenchmarkTurnV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "turn_id",
      "speaker",
      "text",
      "started_at_ms",
      "ended_at_ms",
      "delivery_state",
      "move",
    ]) ||
    !isIdentifier(value.turn_id) ||
    (value.speaker !== "candidate" && value.speaker !== "interviewer") ||
    !isBoundedString(value.text, 0, 4_000) ||
    !isSafeIntegerBetween(value.started_at_ms, 0, durationMs + 60_000) ||
    !isSafeIntegerBetween(value.ended_at_ms, 0, durationMs + 60_000) ||
    value.ended_at_ms < value.started_at_ms ||
    (value.delivery_state !== "delivered" &&
      value.delivery_state !== "partially_delivered")
  ) {
    return null;
  }
  const move = decodeBenchmarkMove(value.move);
  if (value.move !== null && !move) return null;
  if (value.speaker === "candidate" && move !== null) return null;
  return {
    turn_id: value.turn_id,
    speaker: value.speaker,
    text: value.text,
    started_at_ms: value.started_at_ms,
    ended_at_ms: value.ended_at_ms,
    delivery_state: value.delivery_state,
    move,
  };
}

function decodeBenchmarkMove(
  value: unknown
): InterviewerBenchmarkMoveV1 | null {
  return isRecord(value) &&
    hasExactKeys(value, ["move_type", "target_topic", "source_turn_id"]) &&
    includes(INTERVIEWER_MOVE_TYPES, value.move_type) &&
    isBoundedString(value.target_topic, 1, 160) &&
    (value.source_turn_id === null || isIdentifier(value.source_turn_id))
    ? {
        move_type: value.move_type,
        target_topic: value.target_topic,
        source_turn_id: value.source_turn_id,
      }
    : null;
}

function decodeJudgeFailure(value: unknown): InterviewerJudgeFailureV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["code", "dimension", "turn_ids", "explanation"]) ||
    !includes(INTERVIEWER_JUDGE_FAILURE_CODES, value.code) ||
    !includes(INTERVIEWER_QUALITY_DIMENSIONS, value.dimension) ||
    !isUniqueArray(value.turn_ids, 1, 8, isIdentifier) ||
    !isBoundedString(value.explanation, 1, 500)
  ) {
    return null;
  }
  return {
    code: value.code,
    dimension: value.dimension,
    turn_ids: [...value.turn_ids],
    explanation: value.explanation,
  };
}

function invariantViolation(
  code: InterviewerInvariantCode,
  turnIds: string[],
  moveSequence: InterviewerMoveType[]
): InterviewerInvariantViolationV1 {
  return {
    code,
    turn_ids: turnIds,
    move_sequence: [...moveSequence],
    expected_behavior: INVARIANT_EXPECTATIONS[code],
  };
}

function deduplicateViolations(
  violations: InterviewerInvariantViolationV1[]
): InterviewerInvariantViolationV1[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.code}:${violation.turn_ids.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTopic(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRoundType(value: unknown): value is RoundType {
  return (
    value === "product_sense" ||
    value === "execution" ||
    value === "strategy" ||
    value === "behavioral"
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    /^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/.test(value)
  );
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function isSafeIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isUniqueArray<T>(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  predicate: (candidate: unknown) => candidate is T
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(predicate) &&
    new Set(value).size === value.length
  );
}

function includes<T extends readonly unknown[]>(
  values: T,
  value: unknown
): value is T[number] {
  return values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

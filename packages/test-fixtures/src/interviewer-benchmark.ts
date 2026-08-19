import {
  INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
  INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
  INTERVIEWER_QUALITY_RUBRIC_VERSION,
  type InterviewerBenchmarkCandidateBehavior,
  type InterviewerBenchmarkFixtureKind,
  type InterviewerBenchmarkScenarioV1,
  type InterviewerBenchmarkTurnV1,
  type InterviewerInvariantCode,
  type InterviewerJudgeFailureV1,
  type InterviewerMoveType,
  type InterviewerQualityDimension,
  type InterviewerQualityJudgeOutputV1,
  type InterviewerQualityScoresV1,
} from "@meelni/agent";
import type { RoundType } from "@meelni/core";

export const INTERVIEWER_BENCHMARK_SUITE_VERSION =
  "meelni.interviewer-benchmark-suite.v2" as const;
export const INTERVIEWER_BENCHMARK_BASELINE_VERSION =
  "meelni.current-interviewer-baseline.v2" as const;
export const INTERVIEWER_BENCHMARK_SOURCE_COMMIT =
  "1b86ff1d4207aed5ea216a246d6b236c74be66d4" as const;
export const INTERVIEWER_BENCHMARK_REPLAY_MODEL_VERSION =
  "meelni.interviewer-judge-replay.v1" as const;
export const INTERVIEWER_BENCHMARK_REPLAY_SEEDS = [17, 43, 89] as const;
export const INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS =
  "agent_authored_pending_product_owner_review" as const;

export interface InterviewerBenchmarkCalibrationExampleV1 {
  round_type: RoundType;
  expected_quality: "strong" | "weak";
  scenario_id: string;
  seed: number;
  adjudication_status: typeof INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS;
}

export interface InterviewerBenchmarkCalibrationPairV1 {
  round_type: RoundType;
  strong: InterviewerBenchmarkCalibrationExampleV1;
  weak: InterviewerBenchmarkCalibrationExampleV1;
}

const CURRENT_PRODUCT_SENSE = scenario({
  id: "current-product-sense-strong",
  kind: "current_runtime_baseline",
  title: "Current prompt-led product-sense session with a strong candidate",
  roundType: "product_sense",
  behaviors: ["strong"],
  question:
    "Design a product that helps city residents reduce household food waste.",
  turns: [
    interviewer(
      "ps-i-1",
      "Design a product that helps city residents reduce household food waste.",
      0
    ),
    candidate(
      "ps-c-1",
      "I would focus on apartment residents who want to waste less but lose track of perishables after irregular shopping trips.",
      12_000,
      48_000
    ),
    interviewer(
      "ps-i-2",
      "What outcome matters most for that group?",
      62_000,
      "clarify",
      "priority outcome",
      "ps-c-1"
    ),
    candidate(
      "ps-c-2",
      "Fewer edible items discarded each week, without adding a daily inventory chore.",
      74_000,
      42_000
    ),
    interviewer(
      "ps-i-3",
      "Which moment in their current routine creates the most avoidable waste?",
      118_000,
      "probe",
      "highest-friction moment",
      "ps-c-2"
    ),
    candidate(
      "ps-c-3",
      "The failure happens when plans change and ingredients disappear behind newer groceries, so they are rediscovered too late.",
      132_000,
      64_000
    ),
    interviewer(
      "ps-i-4",
      "How would your first solution help at that moment without becoming another chore?",
      198_000,
      "challenge",
      "solution friction tradeoff",
      "ps-c-3"
    ),
    candidate(
      "ps-c-4",
      "I would use receipt capture plus a weekly meal-change check, then suggest two rescue actions only for items nearing expiry.",
      212_000,
      86_000
    ),
    interviewer(
      "ps-i-5",
      "What would tell you that those rescue actions changed behavior rather than just notification opens?",
      301_000,
      "transition",
      "behavioral success metric",
      "ps-c-4"
    ),
    candidate(
      "ps-c-5",
      "I would measure the share of flagged ingredients confirmed as used, with notification dismissal and incorrect receipt matches as guardrails.",
      315_000,
      82_000
    ),
    interviewer(
      "ps-i-6",
      "What is the biggest risk to that measurement?",
      400_000,
      "challenge",
      "measurement risk",
      "ps-c-5"
    ),
    candidate(
      "ps-c-6",
      "Self-reported use can overstate impact, so I would validate a sample through short waste diaries before scaling.",
      414_000,
      66_000
    ),
    interviewer(
      "ps-i-7",
      "Thanks. That is all for this interview.",
      482_000,
      "close",
      "graceful close",
      "ps-c-6"
    ),
  ],
});

const CURRENT_EXECUTION = scenario({
  id: "current-execution-shallow-silent",
  kind: "current_runtime_baseline",
  title:
    "Current prompt-led execution session with shallow answers and silence",
  roundType: "execution",
  behaviors: ["shallow", "silent"],
  question:
    "A marketplace's completed purchases fell 15% this week. Diagnose the change.",
  turns: [
    interviewer(
      "ex-i-1",
      "A marketplace's completed purchases fell 15% this week. Diagnose the change.",
      0
    ),
    candidate(
      "ex-c-1",
      "I would look at the funnel and the data.",
      12_000,
      24_000
    ),
    interviewer(
      "ex-i-2",
      "What data would you look at?",
      38_000,
      "probe",
      "data",
      "ex-c-1"
    ),
    candidate("ex-c-2", "Conversion, traffic, and users.", 50_000, 18_000),
    interviewer(
      "ex-i-3",
      "Can you be more specific about the metrics?",
      70_000,
      "clarify",
      "metrics",
      "ex-c-2"
    ),
    candidate("ex-c-3", "", 82_000, 28_000),
    interviewer(
      "ex-i-4",
      "Take your time. Which part of the funnel would you inspect first?",
      112_000,
      "clarify",
      "first funnel step",
      "ex-c-3"
    ),
    candidate(
      "ex-c-4",
      "Checkout, because purchases happen there.",
      126_000,
      22_000
    ),
    interviewer(
      "ex-i-5",
      "How would you investigate checkout?",
      151_000,
      "probe",
      "checkout investigation",
      "ex-c-4"
    ),
    candidate(
      "ex-c-5",
      "I would ask engineering if something broke.",
      164_000,
      28_000
    ),
    interviewer(
      "ex-i-6",
      "What would you do next if engineering found no incident?",
      195_000,
      "transition",
      "alternative diagnosis",
      "ex-c-5"
    ),
    candidate(
      "ex-c-6",
      "Maybe segment it by platform or country.",
      209_000,
      30_000
    ),
    interviewer(
      "ex-i-7",
      "Thanks. We will stop there.",
      241_000,
      "close",
      "graceful close",
      "ex-c-6"
    ),
  ],
});

const CURRENT_STRATEGY = scenario({
  id: "current-strategy-rambling-contradictory",
  kind: "current_runtime_baseline",
  title:
    "Current prompt-led strategy session with rambling and contradictory answers",
  roundType: "strategy",
  behaviors: ["rambling", "contradictory", "time_consuming"],
  question:
    "Should a mature collaboration product enter the creator-tools market?",
  turns: [
    interviewer(
      "st-i-1",
      "Should a mature collaboration product enter the creator-tools market?",
      0
    ),
    candidate(
      "st-c-1",
      "The creator economy is large and growing, although growth may be slowing, and we should probably enter broadly while staying focused on enterprise collaboration because that is our moat.",
      12_000,
      126_000
    ),
    interviewer(
      "st-i-2",
      "What makes the market attractive?",
      141_000,
      "probe",
      "market attractiveness",
      "st-c-1"
    ),
    candidate(
      "st-c-2",
      "There are many creators, brands spend money, video is growing, communities matter, and competitors prove demand, but it is hard to know the exact segment.",
      154_000,
      142_000
    ),
    interviewer(
      "st-i-3",
      "Which competitors would you consider?",
      299_000,
      "probe",
      "competitors",
      "st-c-2"
    ),
    candidate(
      "st-c-3",
      "Adobe, Canva, Patreon, YouTube, and many niche tools, though I would avoid competing directly and still build a broad suite.",
      312_000,
      116_000
    ),
    interviewer(
      "st-i-4",
      "How might the company differentiate?",
      431_000,
      "transition",
      "differentiation",
      "st-c-3"
    ),
    candidate(
      "st-c-4",
      "It could use collaboration, templates, AI, distribution, enterprise trust, integrations, and perhaps a marketplace, then learn what works.",
      445_000,
      154_000
    ),
    interviewer(
      "st-i-5",
      "What metric would you use?",
      602_000,
      "transition",
      "success metric",
      "st-c-4"
    ),
    candidate(
      "st-c-5",
      "Weekly active creators, revenue, projects published, retention, and team collaboration could all matter.",
      615_000,
      104_000
    ),
    interviewer(
      "st-i-6",
      "Thanks. That is all for today.",
      721_000,
      "close",
      "graceful close",
      "st-c-5"
    ),
  ],
});

const CURRENT_BEHAVIORAL = scenario({
  id: "current-behavioral-interrupting",
  kind: "current_runtime_baseline",
  title: "Current prompt-led behavioral session with candidate interruptions",
  roundType: "behavioral",
  behaviors: ["interrupting"],
  question:
    "Tell me about a time you changed a roadmap without formal authority.",
  turns: [
    interviewer(
      "be-i-1",
      "Tell me about a time you changed a roadmap without formal authority.",
      0
    ),
    candidate(
      "be-c-1",
      "Our onboarding roadmap ignored a support problem. I brought data to design and engineering, and we changed the quarter plan.",
      12_000,
      64_000
    ),
    interviewer(
      "be-i-2",
      "What did you personally do to change their minds?",
      79_000,
      "probe",
      "personal influence",
      "be-c-1",
      "partially_delivered"
    ),
    candidate(
      "be-c-2",
      "Sorry to jump in. I first interviewed eight support agents and quantified the repeat tickets.",
      81_000,
      46_000
    ),
    interviewer(
      "be-i-3",
      "Walk me through how you used that evidence with the team.",
      130_000,
      "clarify",
      "stakeholder sequence",
      "be-c-2"
    ),
    candidate(
      "be-c-3",
      "I shared the ticket themes in planning, then asked the engineering lead to estimate a smaller fix before requesting a roadmap change.",
      143_000,
      78_000
    ),
    interviewer(
      "be-i-4",
      "What resistance did you encounter?",
      224_000,
      "challenge",
      "resistance",
      "be-c-3"
    ),
    candidate(
      "be-c-4",
      "The growth lead worried about delaying acquisition work, so I proposed a two-week cap and a support-volume threshold.",
      237_000,
      74_000
    ),
    interviewer(
      "be-i-5",
      "What happened after the change?",
      314_000,
      "transition",
      "outcome",
      "be-c-4"
    ),
    candidate(
      "be-c-5",
      "Repeat onboarding tickets fell 22%, but I did not measure whether acquisition slowed during the same period.",
      327_000,
      58_000
    ),
    interviewer(
      "be-i-6",
      "Thanks. We will end the interview here.",
      387_000,
      "close",
      "graceful close",
      "be-c-5"
    ),
  ],
});

const PRODUCT_SENSE_WEAK = calibrationScenario({
  id: "calibration-product-sense-weak",
  roundType: "product_sense",
  title: "Weak product-sense interviewer calibration example",
  question: CURRENT_PRODUCT_SENSE.selected_question,
  turns: [
    candidate(
      "psw-c-1",
      "I would focus on apartment residents.",
      12_000,
      30_000
    ),
    interviewer(
      "psw-i-2",
      "What else?",
      44_000,
      "probe",
      "generic detail",
      "psw-c-1"
    ),
    candidate("psw-c-2", "Maybe reminders and recipes.", 56_000, 24_000),
    interviewer(
      "psw-i-3",
      "What else?",
      82_000,
      "probe",
      "more detail",
      "psw-c-2"
    ),
    candidate("psw-c-3", "A shopping list too.", 94_000, 18_000),
    interviewer(
      "psw-i-4",
      "Thanks. We will stop there.",
      114_000,
      "close",
      "graceful close",
      "psw-c-3"
    ),
  ],
});

const EXECUTION_STRONG = calibrationScenario({
  id: "calibration-execution-strong",
  roundType: "execution",
  title: "Strong execution interviewer calibration example",
  question: CURRENT_EXECUTION.selected_question,
  turns: [
    candidate(
      "exs-c-1",
      "I would first verify whether the drop is real and isolate when it began.",
      12_000,
      42_000
    ),
    interviewer(
      "exs-i-2",
      "Which comparison would distinguish instrumentation from a real purchase decline?",
      56_000,
      "challenge",
      "instrumentation check",
      "exs-c-1"
    ),
    candidate(
      "exs-c-2",
      "I would compare order records with client events and payment captures by hour.",
      69_000,
      48_000
    ),
    interviewer(
      "exs-i-3",
      "If payment captures also fell, which first segmentation gives you the highest information gain?",
      119_000,
      "probe",
      "diagnostic segmentation",
      "exs-c-2"
    ),
    candidate(
      "exs-c-3",
      "Platform and app version, because a recent mobile release could create a sharp boundary.",
      132_000,
      46_000
    ),
    interviewer(
      "exs-i-4",
      "What decision threshold would make you roll that release back?",
      180_000,
      "challenge",
      "rollback threshold",
      "exs-c-3"
    ),
    candidate(
      "exs-c-4",
      "A statistically credible checkout loss over 5% with no offsetting mix change.",
      193_000,
      42_000
    ),
    interviewer(
      "exs-i-5",
      "Thanks. That is all for today.",
      237_000,
      "close",
      "graceful close",
      "exs-c-4"
    ),
  ],
});

const STRATEGY_STRONG = calibrationScenario({
  id: "calibration-strategy-strong",
  roundType: "strategy",
  title: "Strong strategy interviewer calibration example",
  question: CURRENT_STRATEGY.selected_question,
  turns: [
    candidate(
      "sts-c-1",
      "I would target small creator teams whose work already crosses our collaboration surface.",
      12_000,
      46_000
    ),
    interviewer(
      "sts-i-2",
      "What evidence would show that this adjacency is stronger than serving solo creators?",
      60_000,
      "challenge",
      "adjacency evidence",
      "sts-c-1"
    ),
    candidate(
      "sts-c-2",
      "Shared project activity and paid workspace expansion would show existing pull.",
      73_000,
      42_000
    ),
    interviewer(
      "sts-i-3",
      "Which capability would you deliberately not build in the first wedge?",
      117_000,
      "probe",
      "scope tradeoff",
      "sts-c-2"
    ),
    candidate(
      "sts-c-3",
      "I would avoid a marketplace and focus on review, approval, and asset handoff.",
      130_000,
      44_000
    ),
    interviewer(
      "sts-i-4",
      "What competitor response would invalidate that wedge?",
      176_000,
      "challenge",
      "competitive response",
      "sts-c-3"
    ),
    candidate(
      "sts-c-4",
      "If incumbents bundle equivalent team workflows before we prove retention, the entry loses leverage.",
      189_000,
      54_000
    ),
    interviewer(
      "sts-i-5",
      "Thanks. We will stop there.",
      245_000,
      "close",
      "graceful close",
      "sts-c-4"
    ),
  ],
});

const BEHAVIORAL_STRONG = calibrationScenario({
  id: "calibration-behavioral-strong",
  roundType: "behavioral",
  title: "Strong behavioral interviewer calibration example",
  question: CURRENT_BEHAVIORAL.selected_question,
  turns: [
    candidate(
      "bes-c-1",
      "I used support evidence to propose changing an onboarding roadmap.",
      12_000,
      38_000
    ),
    interviewer(
      "bes-i-2",
      "What was your specific decision before anyone else agreed?",
      52_000,
      "probe",
      "candidate decision",
      "bes-c-1"
    ),
    candidate(
      "bes-c-2",
      "I decided to ask for a two-week fix instead of replacing the whole quarter plan.",
      65_000,
      48_000
    ),
    interviewer(
      "bes-i-3",
      "Who resisted that request, and what did you change because of their concern?",
      115_000,
      "challenge",
      "stakeholder resistance",
      "bes-c-2"
    ),
    candidate(
      "bes-c-3",
      "Growth resisted; I added a time cap and an acquisition guardrail.",
      128_000,
      46_000
    ),
    interviewer(
      "bes-i-4",
      "What result can you attribute to your action, and what remains uncertain?",
      176_000,
      "transition",
      "attributed result",
      "bes-c-3"
    ),
    candidate(
      "bes-c-4",
      "Tickets fell 22%; acquisition impact remained uncertain because I had not set a clean control.",
      189_000,
      52_000
    ),
    interviewer(
      "bes-i-5",
      "Thanks. That concludes the interview.",
      243_000,
      "close",
      "graceful close",
      "bes-c-4"
    ),
  ],
});

const INVARIANT_CONTROLS = [
  invariantControl(
    "control-coaching",
    "coaching",
    "You should start by using a user-needs framework.",
    "probe",
    "framework"
  ),
  invariantControl(
    "control-mid-session-evaluation",
    "mid_session_evaluation",
    "That is a strong answer.",
    "probe",
    "answer quality"
  ),
  invariantControl(
    "control-multiple-questions",
    "multiple_questions",
    "Which metric matters most? What guardrail would you add?",
    "probe",
    "metrics"
  ),
  repeatedProbeControl(),
  deadlineControl(),
  postCloseControl(),
] as const;

const SCENARIOS = [
  CURRENT_PRODUCT_SENSE,
  CURRENT_EXECUTION,
  CURRENT_STRATEGY,
  CURRENT_BEHAVIORAL,
  PRODUCT_SENSE_WEAK,
  EXECUTION_STRONG,
  STRATEGY_STRONG,
  BEHAVIORAL_STRONG,
  ...INVARIANT_CONTROLS,
] as const;

const OUTPUTS = createFrozenJudgeOutputs();

export const INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS: readonly InterviewerBenchmarkCalibrationPairV1[] =
  [
    calibrationPair(
      "product_sense",
      CURRENT_PRODUCT_SENSE.scenario_id,
      17,
      PRODUCT_SENSE_WEAK.scenario_id,
      0
    ),
    calibrationPair(
      "execution",
      EXECUTION_STRONG.scenario_id,
      0,
      CURRENT_EXECUTION.scenario_id,
      17
    ),
    calibrationPair(
      "strategy",
      STRATEGY_STRONG.scenario_id,
      0,
      CURRENT_STRATEGY.scenario_id,
      17
    ),
    calibrationPair(
      "behavioral",
      BEHAVIORAL_STRONG.scenario_id,
      0,
      CURRENT_BEHAVIORAL.scenario_id,
      17
    ),
  ] as const;

export function createInterviewerBenchmarkScenarios(): InterviewerBenchmarkScenarioV1[] {
  return structuredClone([...SCENARIOS]);
}

export function createInterviewerBenchmarkJudgeOutputs(): InterviewerQualityJudgeOutputV1[] {
  return structuredClone(OUTPUTS);
}

function createFrozenJudgeOutputs(): InterviewerQualityJudgeOutputV1[] {
  const baseline = [
    baselineRuns(
      CURRENT_PRODUCT_SENSE,
      scoreSet(4, 4, 4, 3, 4, 4, 3, 3, 3, 4),
      [
        failure(
          "challenge_miscalibrated",
          "challenge_calibration",
          ["ps-i-4"],
          "The challenge tests friction but does not introduce a sharper constraint."
        ),
      ]
    ),
    baselineRuns(CURRENT_EXECUTION, scoreSet(3, 2, 2, 2, 4, 4, 2, 2, 3, 3), [
      failure(
        "generic_probe",
        "depth",
        ["ex-i-2", "ex-i-3"],
        "The probes remain generic instead of testing the candidate's causal diagnosis."
      ),
      failure(
        "missed_candidate_evidence",
        "evidence_targeting",
        ["ex-c-5", "ex-i-6"],
        "The interviewer does not turn the engineering hypothesis into a falsifiable branch."
      ),
    ]),
    baselineRuns(CURRENT_STRATEGY, scoreSet(3, 2, 2, 2, 4, 4, 2, 2, 2, 4), [
      failure(
        "missed_candidate_evidence",
        "evidence_targeting",
        ["st-c-1", "st-i-2"],
        "The interviewer misses the contradiction between broad entry and enterprise focus."
      ),
      failure(
        "poor_time_management",
        "time_management",
        ["st-c-4", "st-i-5"],
        "The session advances after several long lists without forcing a decision."
      ),
    ]),
    baselineRuns(CURRENT_BEHAVIORAL, scoreSet(3, 3, 2, 3, 4, 4, 2, 2, 2, 3), [
      failure(
        "missed_candidate_evidence",
        "evidence_targeting",
        ["be-c-5", "be-i-6"],
        "The interviewer closes without probing the candidate's admitted attribution gap."
      ),
      failure(
        "weak_progression",
        "round_progression",
        ["be-i-3", "be-i-5"],
        "The sequence gathers facts but does not reach learning or a counterfactual."
      ),
    ]),
  ].flat();

  return [
    ...baseline,
    judgeOutput(
      PRODUCT_SENSE_WEAK.scenario_id,
      0,
      scoreSet(2, 1, 1, 1, 4, 4, 1, 1, 3, 3),
      [
        failure(
          "generic_probe",
          "depth",
          ["psw-i-2", "psw-i-3"],
          "Repeated generic prompts do not test the candidate's product reasoning."
        ),
        failure(
          "redundant_probe",
          "redundancy",
          ["psw-i-2", "psw-i-3"],
          "Both turns request unspecified additional content."
        ),
      ]
    ),
    judgeOutput(
      EXECUTION_STRONG.scenario_id,
      0,
      scoreSet(4, 4, 4, 4, 4, 4, 4, 4, 4, 4),
      []
    ),
    judgeOutput(
      STRATEGY_STRONG.scenario_id,
      0,
      scoreSet(4, 4, 4, 4, 4, 4, 4, 4, 4, 4),
      []
    ),
    judgeOutput(
      BEHAVIORAL_STRONG.scenario_id,
      0,
      scoreSet(4, 4, 4, 4, 4, 4, 4, 4, 4, 4),
      []
    ),
  ];
}

function baselineRuns(
  candidate: InterviewerBenchmarkScenarioV1,
  base: InterviewerQualityScoresV1,
  failures: InterviewerJudgeFailureV1[]
): InterviewerQualityJudgeOutputV1[] {
  return INTERVIEWER_BENCHMARK_REPLAY_SEEDS.map((seed, index) => {
    const scores = structuredClone(base);
    const dimension =
      index === 1 ? "depth" : index === 2 ? "time_management" : null;
    if (dimension) {
      scores[dimension] = Math.max(0, scores[dimension] - 1) as
        | 0
        | 1
        | 2
        | 3
        | 4;
    }
    return judgeOutput(candidate.scenario_id, seed, scores, failures);
  });
}

function judgeOutput(
  scenarioId: string,
  seed: number,
  scores: InterviewerQualityScoresV1,
  failures: InterviewerJudgeFailureV1[]
): InterviewerQualityJudgeOutputV1 {
  return {
    contract_version: INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
    rubric_version: INTERVIEWER_QUALITY_RUBRIC_VERSION,
    scenario_id: scenarioId,
    seed,
    scores,
    overall_score:
      Object.values(scores).reduce<number>((total, score) => total + score, 0) *
      2.5,
    failures,
  };
}

function scoreSet(
  questionRelevance: 0 | 1 | 2 | 3 | 4,
  depth: 0 | 1 | 2 | 3 | 4,
  evidenceTargeting: 0 | 1 | 2 | 3 | 4,
  redundancy: 0 | 1 | 2 | 3 | 4,
  oneQuestionPerTurn: 0 | 1 | 2 | 3 | 4,
  noCoachingOrEvaluation: 0 | 1 | 2 | 3 | 4,
  challengeCalibration: 0 | 1 | 2 | 3 | 4,
  roundProgression: 0 | 1 | 2 | 3 | 4,
  timeManagement: 0 | 1 | 2 | 3 | 4,
  gracefulClose: 0 | 1 | 2 | 3 | 4
): InterviewerQualityScoresV1 {
  return {
    question_relevance: questionRelevance,
    depth,
    evidence_targeting: evidenceTargeting,
    redundancy,
    one_question_per_turn: oneQuestionPerTurn,
    no_coaching_or_evaluation: noCoachingOrEvaluation,
    challenge_calibration: challengeCalibration,
    round_progression: roundProgression,
    time_management: timeManagement,
    graceful_close: gracefulClose,
  };
}

function failure(
  code: InterviewerJudgeFailureV1["code"],
  dimension: InterviewerQualityDimension,
  turnIds: string[],
  explanation: string
): InterviewerJudgeFailureV1 {
  return { code, dimension, turn_ids: turnIds, explanation };
}

function scenario(input: {
  id: string;
  kind: InterviewerBenchmarkFixtureKind;
  title: string;
  roundType: RoundType;
  behaviors: InterviewerBenchmarkCandidateBehavior[];
  question: string;
  turns: InterviewerBenchmarkTurnV1[];
  expectedInvariantCodes?: InterviewerInvariantCode[];
}): InterviewerBenchmarkScenarioV1 {
  return {
    contract_version: INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
    scenario_id: input.id,
    fixture_kind: input.kind,
    title: input.title,
    provenance: "fully_synthetic",
    authoring_provenance: "agent_authored_not_human_adjudicated",
    round_type: input.roundType,
    candidate_behaviors: input.behaviors,
    prompt_contract_version: "full_interview_prompt_v1",
    selected_question: input.question,
    duration_ms: 900_000,
    deadline_ms: 900_000,
    turns: input.turns,
    expected_invariant_codes: input.expectedInvariantCodes ?? [],
  };
}

function calibrationScenario(input: {
  id: string;
  roundType: RoundType;
  title: string;
  question: string;
  turns: InterviewerBenchmarkTurnV1[];
}): InterviewerBenchmarkScenarioV1 {
  return scenario({
    id: input.id,
    kind: "judge_calibration",
    title: input.title,
    roundType: input.roundType,
    behaviors: ["shallow"],
    question: input.question,
    turns: [
      interviewer(`${input.id}-opening`, input.question, 0),
      ...input.turns,
    ],
  });
}

function invariantControl(
  id: string,
  code: InterviewerInvariantCode,
  text: string,
  moveType: InterviewerMoveType,
  topic: string
): InterviewerBenchmarkScenarioV1 {
  const question = "Design a synthetic product for commuters.";
  return scenario({
    id,
    kind: "invariant_control",
    title: `Deterministic ${code} negative control`,
    roundType: "product_sense",
    behaviors: ["shallow"],
    question,
    turns: [
      interviewer(`${id}-i-1`, question, 0),
      candidate(`${id}-c-1`, "I would start with commuters.", 12_000, 22_000),
      interviewer(`${id}-i-2`, text, 36_000, moveType, topic, `${id}-c-1`),
    ],
    expectedInvariantCodes: [code],
  });
}

function repeatedProbeControl(): InterviewerBenchmarkScenarioV1 {
  const id = "control-repeated-probe";
  const question = "Design a synthetic product for commuters.";
  return scenario({
    id,
    kind: "invariant_control",
    title: "Deterministic repeated-probe negative control",
    roundType: "product_sense",
    behaviors: ["shallow"],
    question,
    turns: [
      interviewer(`${id}-i-1`, question, 0),
      candidate(`${id}-c-1`, "I would focus on bus riders.", 12_000, 20_000),
      interviewer(
        `${id}-i-2`,
        "Why bus riders?",
        34_000,
        "probe",
        "priority segment",
        `${id}-c-1`
      ),
      candidate(
        `${id}-c-2`,
        "They face unpredictable transfers.",
        46_000,
        20_000
      ),
      interviewer(
        `${id}-i-3`,
        "Why bus riders?",
        68_000,
        "probe",
        "priority segment",
        `${id}-c-2`
      ),
    ],
    expectedInvariantCodes: ["repeated_probe"],
  });
}

function deadlineControl(): InterviewerBenchmarkScenarioV1 {
  const id = "control-deadline-violation";
  const question = "Design a synthetic product for commuters.";
  return scenario({
    id,
    kind: "invariant_control",
    title: "Deterministic deadline negative control",
    roundType: "product_sense",
    behaviors: ["time_consuming"],
    question,
    turns: [
      interviewer(`${id}-i-1`, question, 0),
      candidate(`${id}-c-1`, "I would focus on bus riders.", 12_000, 20_000),
      interviewer(
        `${id}-i-2`,
        "What would you measure?",
        900_000,
        "probe",
        "metric",
        `${id}-c-1`
      ),
    ],
    expectedInvariantCodes: ["deadline_violation"],
  });
}

function postCloseControl(): InterviewerBenchmarkScenarioV1 {
  const id = "control-post-close-speech";
  const question = "Design a synthetic product for commuters.";
  return scenario({
    id,
    kind: "invariant_control",
    title: "Deterministic post-close negative control",
    roundType: "product_sense",
    behaviors: ["strong"],
    question,
    turns: [
      interviewer(`${id}-i-1`, question, 0),
      candidate(`${id}-c-1`, "I would focus on bus riders.", 12_000, 20_000),
      interviewer(
        `${id}-i-2`,
        "Thanks. That concludes the interview.",
        34_000,
        "close",
        "graceful close",
        `${id}-c-1`
      ),
      interviewer(
        `${id}-i-3`,
        "One additional thought.",
        40_000,
        "transition",
        "extra speech",
        `${id}-c-1`
      ),
    ],
    expectedInvariantCodes: ["post_close_speech"],
  });
}

function interviewer(
  turnId: string,
  text: string,
  startedAtMs: number,
  moveType: InterviewerMoveType | null = null,
  targetTopic: string | null = null,
  sourceTurnId: string | null = null,
  deliveryState: InterviewerBenchmarkTurnV1["delivery_state"] = "delivered"
): InterviewerBenchmarkTurnV1 {
  return {
    turn_id: turnId,
    speaker: "interviewer",
    text,
    started_at_ms: startedAtMs,
    ended_at_ms: startedAtMs + 1_500,
    delivery_state: deliveryState,
    move:
      moveType && targetTopic
        ? {
            move_type: moveType,
            target_topic: targetTopic,
            source_turn_id: sourceTurnId,
          }
        : null,
  };
}

function candidate(
  turnId: string,
  text: string,
  startedAtMs: number,
  durationMs: number
): InterviewerBenchmarkTurnV1 {
  return {
    turn_id: turnId,
    speaker: "candidate",
    text,
    started_at_ms: startedAtMs,
    ended_at_ms: startedAtMs + durationMs,
    delivery_state: "delivered",
    move: null,
  };
}

function calibrationPair(
  roundType: RoundType,
  strongScenarioId: string,
  strongSeed: number,
  weakScenarioId: string,
  weakSeed: number
): InterviewerBenchmarkCalibrationPairV1 {
  return {
    round_type: roundType,
    strong: calibrationExample(
      roundType,
      "strong",
      strongScenarioId,
      strongSeed
    ),
    weak: calibrationExample(roundType, "weak", weakScenarioId, weakSeed),
  };
}

function calibrationExample(
  roundType: RoundType,
  expectedQuality: "strong" | "weak",
  scenarioId: string,
  seed: number
): InterviewerBenchmarkCalibrationExampleV1 {
  return {
    round_type: roundType,
    expected_quality: expectedQuality,
    scenario_id: scenarioId,
    seed,
    adjudication_status: INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
  };
}

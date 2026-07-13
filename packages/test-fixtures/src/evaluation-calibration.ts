import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackDimension,
  type FeedbackV2Scores,
} from "@meelni/core";
import { SCORED_ADJUDICATIONS } from "./evaluation-calibration-adjudications";

export const EVALUATION_GOLD_SET_VERSION = "pm-gold-set.v4" as const;
export const EVALUATION_ADJUDICATION_VERSION =
  "pm-gold-adjudication-candidates.v4" as const;

export const EVALUATION_CALIBRATION_THRESHOLDS = {
  evidenceValidityRate: 1,
  insufficientHandlingRate: 1,
  scoreBandAgreementRate: 0.8,
  minimumDimensionScoreBandAgreementRate: 0.8,
  minimumRoundScoreBandAgreementRate: 0.75,
  minimumStateScoreBandAgreementRate: 0.75,
  maximumRepeatedRunScoreRange: 1,
  modelVersionMatchRate: 1,
  minimumProviderRuns: 3,
  maximumProviderRuns: 3,
  maximumProviderCalls: 96,
} as const;

export const CALIBRATION_ROUND_TYPES = [
  "product_sense",
  "execution",
  "strategy",
  "behavioral",
] as const;

export type CalibrationRoundType = (typeof CALIBRATION_ROUND_TYPES)[number];
export type CalibrationCompletionState = "full" | "partial" | "insufficient";
export type CalibrationQuality = "weak" | "average" | "strong";

const DELEGATED_CORRECTION_CASE_IDS = new Set([
  "product_sense:01:caregiver-planning",
  "product_sense:02:accessible-transit",
  "product_sense:04:community-kitchens",
  "product_sense:05:language-practice",
  "execution:02:search-latency",
  "execution:04:mobile-migration",
  "execution:07:warehouse-pilot",
  "strategy:01:creator-market",
  "strategy:02:regional-expansion",
  "strategy:04:open-platform",
  "strategy:05:education-entry",
  "strategy:07:ai-positioning",
  "behavioral:01:roadmap-conflict",
  "behavioral:02:failed-launch",
  "behavioral:04:customer-escalation",
  "behavioral:05:team-disagreement",
  "behavioral:07:mentoring",
]);

export interface CalibrationTranscriptTurn {
  contractVersion: 2;
  eventId: string;
  speaker: "user" | "interviewer";
  text: string;
  startedAt: Date;
  endedAt: Date;
}

export interface CalibrationScoreBand {
  minimum: number;
  maximum: number;
}

export type CalibrationScoreBands = Record<
  FeedbackDimension,
  CalibrationScoreBand
>;

export interface CalibrationEvidenceAnchor {
  dimension: FeedbackDimension;
  kind: "strength" | "improvement";
  observation: string;
  turnRef: string;
  quote: string;
  nextStep: string;
}

export interface EvaluationCalibrationCase {
  id: string;
  title: string;
  provenance: "fully_synthetic";
  adjudicationProvenance: "agent_authored_synthetic_candidate";
  roundType: CalibrationRoundType;
  goldSetVersion: typeof EVALUATION_GOLD_SET_VERSION;
  adjudicationVersion: typeof EVALUATION_ADJUDICATION_VERSION;
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  expectedCompletionState: CalibrationCompletionState;
  expectedQuality: CalibrationQuality | null;
  scoreBands: CalibrationScoreBands | null;
  evidenceAnchors: CalibrationEvidenceAnchor[];
  transcript: CalibrationTranscriptTurn[];
}

interface ScoredSeed {
  slug: string;
  title: string;
  answers: readonly [string, string, string];
  scores: FeedbackV2Scores;
  evidenceDimensions: readonly [FeedbackDimension, FeedbackDimension];
}

const SCORED_SEEDS: Record<CalibrationRoundType, readonly ScoredSeed[]> = {
  product_sense: [
    seed(
      "caregiver-planning",
      "Caregiver planning",
      [
        "I would start with working caregivers who coordinate changing pickup schedules across several adults.",
        "Their hardest problem is not finding a calendar; it is resolving last-minute ownership without repeated messages.",
        "I would test a shared handoff plan and measure weeks with every pickup confirmed before the commute.",
      ],
      scores(8, 8, 9, 8, 7),
      ["insight", "leadership"]
    ),
    seed(
      "accessible-transit",
      "Accessible transit",
      [
        "I would focus on wheelchair users planning unfamiliar public transit routes because uncertainty creates abandoned trips.",
        "The first experience should surface elevator reliability and a step-free backup before the rider leaves home.",
        "I would measure completed planned journeys while guarding against stale accessibility reports.",
      ],
      scores(8, 8, 8, 7, 7),
      ["insight", "communication"]
    ),
    seed(
      "teacher-feedback",
      "Teacher feedback",
      [
        "I would begin with new middle-school teachers who need fast feedback after a difficult lesson.",
        "The core need is one actionable reflection while the class context is still fresh, not another long reporting form.",
        "I would prototype a two-minute reflection and track whether teachers reuse one suggestion in the next lesson.",
      ],
      scores(7, 8, 8, 8, 7),
      ["clarity", "leadership"]
    ),
    seed(
      "community-kitchens",
      "Community kitchens",
      [
        "I would prioritize volunteer kitchen coordinators who must match donated ingredients to tonight's meal plan.",
        "Their pain is deciding what can be served safely before perishable stock expires.",
        "I would launch an inventory-to-menu suggestion and measure rescued portions with allergen mistakes as a guardrail.",
      ],
      scores(8, 7, 9, 7, 8),
      ["insight", "leadership"]
    ),
    seed(
      "language-practice",
      "Language practice",
      [
        "I would target adult language learners who understand lessons but avoid spontaneous conversation.",
        "They need a psychologically safe prompt tied to a real upcoming situation rather than more vocabulary cards.",
        "I would test short role-play plans and measure completed conversations outside the product.",
      ],
      scores(7, 8, 8, 8, 7),
      ["insight", "communication"]
    ),
    seed(
      "repair-guidance",
      "Repair guidance",
      [
        "I would start with renters trying to diagnose a minor appliance problem before contacting maintenance.",
        "The product should help them describe symptoms safely without encouraging repairs that require a professional.",
        "I would measure correctly routed requests and treat unsafe self-repair attempts as a stopping guardrail.",
      ],
      scores(8, 9, 8, 8, 8),
      ["clarity", "leadership"]
    ),
    seed(
      "neighborhood-safety",
      "Neighborhood safety",
      [
        "I would focus on late-shift workers deciding how to get from a station to home.",
        "The need is a trustworthy route choice based on current lighting and open businesses, not a generic crime score.",
        "I would test route confidence and completed walks while auditing reports for bias.",
      ],
      scores(8, 8, 9, 7, 8),
      ["insight", "leadership"]
    ),
    seed(
      "clinic-followup",
      "Clinic follow-up",
      [
        "I would prioritize clinic patients who leave with several instructions and limited time to ask questions.",
        "The first job is confirming the next action in plain language, with escalation back to the care team when uncertain.",
        "I would measure correctly completed follow-ups and never optimize engagement ahead of clinical safety.",
      ],
      scores(9, 9, 9, 8, 9),
      ["structure", "leadership"]
    ),
  ],
  execution: [
    seed(
      "merchant-onboarding",
      "Merchant onboarding",
      [
        "I would define activation as a merchant publishing one purchasable item with payment and fulfillment configured.",
        "The first milestone removes catalog import failures before adding optional storefront customization.",
        "I would sequence data migration behind a rollbackable cohort and monitor failed orders as the guardrail.",
      ],
      scores(9, 8, 8, 8, 8),
      ["structure", "leadership"]
    ),
    seed(
      "search-latency",
      "Search latency",
      [
        "I would first separate server latency, index freshness, and client rendering so the team owns the right bottleneck.",
        "The launch criterion is p95 results under two seconds for the highest-volume queries without lowering relevance.",
        "I would ship caching to a small cohort and keep an instant rollback if stale results increase.",
      ],
      scores(9, 9, 8, 8, 8),
      ["structure", "leadership"]
    ),
    seed(
      "support-routing",
      "Support routing",
      [
        "I would map the current queue by issue type, transfer rate, and time to resolution before selecting automation.",
        "The first release recommends a destination to agents instead of automatically closing customer cases.",
        "I would measure fewer transfers while reviewing misroutes weekly with support leads.",
      ],
      scores(8, 8, 8, 8, 8),
      ["structure", "communication"]
    ),
    seed(
      "mobile-migration",
      "Mobile migration",
      [
        "I would inventory critical user journeys and assign parity owners before replacing the mobile architecture.",
        "Authentication and offline drafts are release blockers; visual polish can migrate after behavioral parity.",
        "I would use staged adoption with crash-free sessions and lost drafts as explicit rollback signals.",
      ],
      scores(9, 8, 8, 7, 9),
      ["structure", "leadership"]
    ),
    seed(
      "pricing-rollout",
      "Pricing rollout",
      [
        "I would separate catalog correctness, entitlement enforcement, billing recovery, and customer communication into independent gates.",
        "Existing customers keep their current access until migration evidence and support playbooks are ready.",
        "I would monitor failed renewals and unexpected entitlement loss before expanding the cohort.",
      ],
      scores(9, 8, 8, 8, 9),
      ["structure", "leadership"]
    ),
    seed(
      "moderation-queue",
      "Moderation queue",
      [
        "I would prioritize the oldest high-severity reports and expose uncertainty instead of hiding everything behind one score.",
        "The first tool gives reviewers context and reversible actions rather than autonomous permanent enforcement.",
        "I would track decision time, appeal reversals, and backlog age by severity.",
      ],
      scores(8, 8, 9, 8, 8),
      ["insight", "leadership"]
    ),
    seed(
      "warehouse-pilot",
      "Warehouse pilot",
      [
        "I would choose one warehouse with stable scanning behavior and define a manual fallback before the pilot.",
        "The critical path is inventory accuracy through pick confirmation, not every supervisor dashboard.",
        "I would stop the pilot if mismatch rates exceed the existing process for two shifts.",
      ],
      scores(8, 8, 8, 7, 9),
      ["structure", "leadership"]
    ),
    seed(
      "incident-recovery",
      "Incident recovery",
      [
        "I would assign one incident commander, stabilize writes, and publish a shared customer-impact timeline.",
        "Recovery requires validating data integrity before restoring full traffic, even if latency looks healthy.",
        "Afterward I would convert the failed assumption into an automated rollback test and named owner.",
      ],
      scores(9, 9, 9, 9, 9),
      ["leadership", "insight"]
    ),
  ],
  strategy: [
    seed(
      "creator-market",
      "Creator market",
      [
        "I would segment professional creators from hobbyists because their willingness to pay and workflow depth differ.",
        "Our advantage should be reliable collaboration around existing assets rather than a broad social network.",
        "I would enter through paid team review and use retained collaborative projects as the leading signal.",
      ],
      scores(8, 8, 9, 8, 8),
      ["insight", "leadership"]
    ),
    seed(
      "regional-expansion",
      "Regional expansion",
      [
        "I would compare demand density, payment readiness, regulation, and local supply before choosing a country.",
        "The recommendation is one city where existing cross-border use already proves the strongest unmet need.",
        "I would fund a reversible launch and require repeat use before building country-specific breadth.",
      ],
      scores(9, 8, 8, 8, 8),
      ["structure", "leadership"]
    ),
    seed(
      "bundling",
      "Product bundling",
      [
        "I would identify which customer job truly spans both products instead of bundling only to raise average revenue.",
        "The strongest option is a shared workflow for teams that currently export data between the tools.",
        "I would test attach rate and retained use while protecting customers who need only one product.",
      ],
      scores(8, 8, 8, 8, 7),
      ["insight", "communication"]
    ),
    seed(
      "open-platform",
      "Open platform",
      [
        "I would evaluate whether ecosystem breadth improves the core workflow enough to justify governance and support costs.",
        "A narrow read-only API for trusted partners is the reversible first strategic option.",
        "I would expand only if integrations increase retained core usage without creating reliability debt.",
      ],
      scores(8, 9, 8, 8, 8),
      ["clarity", "leadership"]
    ),
    seed(
      "education-entry",
      "Education entry",
      [
        "I would distinguish institutional buyers from individual teachers because procurement and adoption move on different clocks.",
        "The wedge is a teacher-led workflow that produces evidence an administrator can later evaluate.",
        "I would avoid district sales until repeated classroom use proves the learning job is real.",
      ],
      scores(8, 8, 9, 7, 8),
      ["insight", "leadership"]
    ),
    seed(
      "marketplace-liquidity",
      "Marketplace liquidity",
      [
        "I would map whether the constraint is buyer demand, qualified supply, matching, or trust in each local market.",
        "The strategy should concentrate one category and geography rather than subsidize broad but unusable inventory.",
        "I would measure successful repeat matches and reduce incentives once organic liquidity holds.",
      ],
      scores(9, 8, 9, 8, 8),
      ["structure", "insight"]
    ),
    seed(
      "ai-positioning",
      "AI positioning",
      [
        "I would anchor the strategy in a costly customer decision the product can improve, not in access to a general model.",
        "Our defensibility would come from workflow integration and verified outcomes rather than generated text volume.",
        "I would narrow the launch to one decision and publish where human review remains required.",
      ],
      scores(8, 9, 9, 8, 8),
      ["clarity", "leadership"]
    ),
    seed(
      "portfolio-exit",
      "Portfolio exit",
      [
        "I would compare strategic fit, customer dependency, switching cost, and reinvestment return before recommending an exit.",
        "The least destructive path is a managed sunset with export support and a partner migration option.",
        "I would set a decision date, fund customer transition, and measure successful migrations rather than short-term margin.",
      ],
      scores(9, 9, 9, 8, 9),
      ["structure", "leadership"]
    ),
  ],
  behavioral: [
    seed(
      "roadmap-conflict",
      "Roadmap conflict",
      [
        "The situation was a quarterly roadmap split between reliability work and a promised enterprise feature.",
        "I brought support evidence, incident cost, and the sales commitment into one decision meeting, then proposed a smaller contract-safe release.",
        "We cut repeat incidents and delivered the committed customer outcome two weeks later; I learned to surface constraint ownership earlier.",
      ],
      scores(9, 8, 8, 8, 9),
      ["structure", "leadership"]
    ),
    seed(
      "failed-launch",
      "Failed launch",
      [
        "I launched a notification change that increased opens but also increased opt-outs among frequent users.",
        "I paused expansion, owned the metric mistake, and worked with research to separate urgent from routine use cases.",
        "The revised controls recovered opt-outs within a month, and I now define harm guardrails before engagement targets.",
      ],
      scores(8, 9, 9, 8, 9),
      ["insight", "leadership"]
    ),
    seed(
      "influence-without-authority",
      "Influence without authority",
      [
        "A platform team did not prioritize the API reliability work my product needed for launch.",
        "I quantified shared incident load, offered engineering support, and aligned both directors on one service objective.",
        "The teams shipped the fix before launch and reused the objective afterward; I learned to frame influence around shared operational cost.",
      ],
      scores(8, 8, 8, 9, 9),
      ["communication", "leadership"]
    ),
    seed(
      "customer-escalation",
      "Customer escalation",
      [
        "A major customer found data missing from an export hours before their board review.",
        "I joined the incident, gave a precise update cadence, and separated immediate recovery from the longer root-cause work.",
        "We restored the export that day and added reconciliation checks; I learned that clarity under uncertainty builds more trust than optimistic estimates.",
      ],
      scores(9, 9, 8, 9, 9),
      ["clarity", "leadership"]
    ),
    seed(
      "team-disagreement",
      "Team disagreement",
      [
        "Design and engineering disagreed about whether a complex onboarding interaction was necessary for the first release.",
        "I restated the user risk, asked each lead for the cheapest test, and sponsored a prototype with five target users.",
        "The evidence supported a simpler flow that shipped on time, and both leads adopted the test-first decision pattern.",
      ],
      scores(8, 8, 8, 9, 8),
      ["communication", "leadership"]
    ),
    seed(
      "missed-goal",
      "Missed goal",
      [
        "My team missed an adoption goal because I treated account activation as proof of repeated workflow value.",
        "I shared the miss, interviewed inactive teams, and changed the roadmap from acquisition features to collaborative handoff reliability.",
        "Retained team use improved the next quarter, and I learned to audit whether a metric represents the customer job.",
      ],
      scores(8, 8, 9, 8, 9),
      ["insight", "leadership"]
    ),
    seed(
      "mentoring",
      "Mentoring",
      [
        "A new product manager was struggling to turn broad stakeholder requests into a coherent decision document.",
        "I modeled one problem framing, reviewed drafts with questions instead of edits, and gave them ownership of the next executive review.",
        "They led the review successfully and later taught the method to another teammate; I learned to transfer judgment rather than templates.",
      ],
      scores(8, 9, 8, 9, 9),
      ["communication", "leadership"]
    ),
    seed(
      "ethical-tradeoff",
      "Ethical tradeoff",
      [
        "A proposed growth experiment would have made account cancellation harder for customers near renewal.",
        "I documented the short-term revenue upside, the trust risk, and a transparent alternative that tested value reminders without obstructing exit.",
        "Leadership chose the transparent version, which improved retained renewals without more complaints; I learned to make ethical costs explicit in the decision.",
      ],
      scores(9, 9, 9, 9, 10),
      ["leadership", "insight"]
    ),
  ],
};

const NORMALIZED_SCORE_PROFILE_INDEX: Readonly<Record<string, 0 | 2>> = {
  "product_sense:02:accessible-transit": 0,
  "product_sense:04:community-kitchens": 2,
  "execution:02:search-latency": 0,
  "execution:04:mobile-migration": 2,
  "strategy:02:regional-expansion": 0,
  "strategy:04:open-platform": 2,
  "behavioral:02:failed-launch": 0,
  "behavioral:04:customer-escalation": 2,
};

export const evaluationCalibrationCases: readonly EvaluationCalibrationCase[] =
  CALIBRATION_ROUND_TYPES.flatMap((roundType) => [
    ...SCORED_SEEDS[roundType].map((caseSeed, index) =>
      buildScoredCase(roundType, index, caseSeed)
    ),
    buildShortCase(roundType),
    buildLowSignalCase(roundType),
  ]);

export function buildEvaluationAdjudicationReviewManifest() {
  return {
    contractVersion: "evaluation-adjudication-review.v2" as const,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    provenance: "agent_authored_synthetic_candidate" as const,
    approvalRequired: true as const,
    reviewStatus: "pending_independent_exact_hash_review" as const,
    delegatedReview: {
      delegationSource: "product_owner_task_thread" as const,
      panelCount: 2 as const,
      panelOutcome: "changes_required" as const,
      correctionPolicy: "conservative_17_case_union" as const,
      reviewRounds: [
        {
          round: 1 as const,
          correctionPolicy: "conservative_17_case_union" as const,
          correctedCaseCount: 17 as const,
        },
        {
          round: 2 as const,
          reviewedCandidateArtifactHash:
            "e02ec10f89b0bf83bdd5e1085f2b2250e4c3a79babd0e9f50b53db5b70e844f7",
          reviewedCorpusHash:
            "4778053ee573c9828a5b324958eca1972df03f1886684cb77fd4bc4da482e2fe",
          panelOneChangesRequired: [
            "product_sense:05:language-practice",
            "strategy:02:regional-expansion",
            "behavioral:02:failed-launch",
            "behavioral:07:mentoring",
          ],
          panelTwoChangesRequired: [
            "product_sense:05:language-practice",
            "strategy:02:regional-expansion",
            "behavioral:07:mentoring",
          ],
          correctionPolicy: "conservative_4_case_union" as const,
        },
      ],
      decisions: evaluationCalibrationCases
        .filter(({ expectedQuality }) => expectedQuality !== null)
        .map(({ id }) => ({
          caseId: id,
          decision: DELEGATED_CORRECTION_CASE_IDS.has(id)
            ? ("corrected_pending_independent_review" as const)
            : ("preserved_after_unanimous_panel_approval" as const),
        })),
    },
    scoredCaseCount: evaluationCalibrationCases.filter(
      ({ expectedQuality }) => expectedQuality !== null
    ).length,
    cases: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map((fixture) => ({
        id: fixture.id,
        roundType: fixture.roundType,
        expectedQuality: fixture.expectedQuality,
        expectedCompletionState: fixture.expectedCompletionState,
        strength: fixture.evidenceAnchors.find(
          ({ kind }) => kind === "strength"
        ),
        improvement: fixture.evidenceAnchors.find(
          ({ kind }) => kind === "improvement"
        ),
      })),
  };
}

function seed(
  slug: string,
  title: string,
  answers: ScoredSeed["answers"],
  expectedScores: FeedbackV2Scores,
  evidenceDimensions: ScoredSeed["evidenceDimensions"]
): ScoredSeed {
  return { slug, title, answers, scores: expectedScores, evidenceDimensions };
}

function scores(
  structure: number,
  clarity: number,
  insight: number,
  communication: number,
  leadership: number
): FeedbackV2Scores {
  return { structure, clarity, insight, communication, leadership };
}

function buildScoredCase(
  roundType: CalibrationRoundType,
  index: number,
  caseSeed: ScoredSeed
): EvaluationCalibrationCase {
  const id = `${roundType}:${String(index + 1).padStart(2, "0")}:${caseSeed.slug}`;
  const expectedCompletionState = index === 7 ? "full" : "partial";
  const expectedQuality = qualityForIndex(index);
  const profiledAnswers = answersForQuality(
    roundType,
    caseSeed,
    expectedQuality
  );
  const answers =
    expectedCompletionState === "full"
      ? [...profiledAnswers, ...fullSessionExtensions(caseSeed)]
      : [...profiledAnswers];
  const transcript = buildConversation(id, answers, expectedCompletionState);
  const adjudication = SCORED_ADJUDICATIONS[id];
  if (!adjudication) throw new Error(`Missing adjudication candidate: ${id}`);
  const strengthTurn = transcript.find(
    (turn) =>
      turn.eventId === `${id}:user:${adjudication.strength.turnSequence}`
  )!;
  const improvementTurn = transcript.find(
    (turn) =>
      turn.eventId === `${id}:user:${adjudication.improvement.turnSequence}`
  )!;

  return baseCase({
    id,
    title: `${caseSeed.title} (${expectedQuality})`,
    roundType,
    expectedCompletionState,
    expectedQuality,
    transcript,
    scoreBands: toBands(
      scoresForQuality(
        caseSeed.scores,
        expectedQuality,
        NORMALIZED_SCORE_PROFILE_INDEX[id] ?? index
      )
    ),
    evidenceAnchors: [
      {
        dimension: adjudication.strength.dimension,
        kind: "strength",
        observation: adjudication.strength.observation,
        turnRef: strengthTurn.eventId,
        quote: adjudication.strength.quote,
        nextStep: adjudication.strength.nextStep,
      },
      {
        dimension: adjudication.improvement.dimension,
        kind: "improvement",
        observation: adjudication.improvement.observation,
        turnRef: improvementTurn.eventId,
        quote: adjudication.improvement.quote,
        nextStep: adjudication.improvement.nextStep,
      },
    ],
  });
}

function buildShortCase(
  roundType: CalibrationRoundType
): EvaluationCalibrationCase {
  const id = `${roundType}:09:short`;
  return baseCase({
    id,
    title: "Short session negative",
    roundType,
    expectedCompletionState: "insufficient",
    expectedQuality: null,
    scoreBands: null,
    evidenceAnchors: [],
    transcript: timedTurns(id, [
      ["interviewer", "What would you do first?", 0, 10],
      ["user", "I would start by asking who has the problem.", 20, 45],
    ]),
  });
}

function buildLowSignalCase(
  roundType: CalibrationRoundType
): EvaluationCalibrationCase {
  const id = `${roundType}:10:low-signal`;
  return baseCase({
    id,
    title: "Low-signal session negative",
    roundType,
    expectedCompletionState: "insufficient",
    expectedQuality: null,
    scoreBands: null,
    evidenceAnchors: [],
    transcript: timedTurns(id, [
      ["interviewer", "How would you frame the problem?", 0, 10],
      ["user", "Um yes maybe we could try that approach.", 20, 60],
      ["interviewer", "What tradeoff matters most?", 150, 160],
      ["user", "I guess that sounds okay to me for now.", 170, 230],
      ["interviewer", "How would you measure success?", 300, 310],
      ["user", "Well yes I would probably do something like that.", 320, 370],
    ]),
  });
}

function baseCase(
  input: Pick<
    EvaluationCalibrationCase,
    | "id"
    | "title"
    | "roundType"
    | "expectedCompletionState"
    | "expectedQuality"
    | "scoreBands"
    | "evidenceAnchors"
    | "transcript"
  >
): EvaluationCalibrationCase {
  return {
    ...input,
    provenance: "fully_synthetic",
    adjudicationProvenance: "agent_authored_synthetic_candidate",
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
  };
}

function qualityForIndex(index: number): CalibrationQuality {
  if (index <= 1) return "weak";
  if (index <= 3) return "average";
  return "strong";
}

function scoresForQuality(
  strongScores: FeedbackV2Scores,
  quality: CalibrationQuality,
  index: number
): FeedbackV2Scores {
  if (quality === "weak") {
    return index % 2 === 0 ? scores(3, 4, 3, 4, 3) : scores(4, 3, 4, 3, 4);
  }
  if (quality === "average") {
    return index % 2 === 0 ? scores(5, 6, 5, 6, 5) : scores(6, 5, 6, 5, 6);
  }
  return strongScores;
}

function answersForQuality(
  roundType: CalibrationRoundType,
  caseSeed: ScoredSeed,
  quality: CalibrationQuality
): readonly [string, string, string] {
  if (quality === "strong") return caseSeed.answers;

  const weak: Record<CalibrationRoundType, readonly [string, string, string]> =
    {
      product_sense: [
        `For ${caseSeed.title}, I would first define the intended user outcome. After that I would brainstorm features for everyone instead of choosing a user segment.`,
        "I would probably build the easiest idea and ask users whether they like it, but I have not defined the underlying problem or tradeoff.",
        "I would watch general usage after launch; I have not selected an outcome metric, guardrail, or decision threshold.",
      ],
      execution: [
        `For ${caseSeed.title}, I would first define a usable release as the delivery goal. I would then ask the team to move quickly without an owner or ordered milestones.`,
        "I would work on several pieces at once and handle dependencies when they appear rather than prioritize by risk.",
        "I would call the launch successful if it ships; I have not set a measurable outcome, guardrail, or rollback condition.",
      ],
      strategy: [
        `For ${caseSeed.title}, I would first test whether customers have an unmet need. I still have not sized a segment or explained why this market matters now.`,
        "I would copy the most visible competitor feature and decide the business model later without comparing strategic alternatives.",
        "I would recommend entering because growth seems possible, although I have not named a risk, trigger, or evidence that would change the decision.",
      ],
      behavioral: [
        `In the ${caseSeed.title} situation, the team had a difficult problem and I was involved, but I cannot clearly separate my responsibility from the group's.`,
        "I scheduled one discussion and summarized the disagreement for the group, but I did not drive a clear tradeoff or decision.",
        "The outcome was generally positive, but I do not have a concrete result and my learning is only that communication matters.",
      ],
    };
  if (quality === "weak") return weak[roundType];

  const average: Record<
    CalibrationRoundType,
    readonly [string, string, string]
  > = {
    product_sense: [
      `For ${caseSeed.title}, I would choose one broad user group and confirm its main pain point before selecting a solution.`,
      "I would test one simple concept first, though my segmentation and comparison with alternatives are still fairly surface level.",
      "I would track repeat use and one satisfaction measure, but I have not made the guardrail or launch threshold precise.",
    ],
    execution: [
      `For ${caseSeed.title}, I would define a launch goal, identify the main workstreams, and give each one an owner.`,
      "I would prioritize the highest-user-impact item first, although my dependency analysis and rollback plan need more detail.",
      "I would track adoption and defects after a staged release, but I have not specified exact thresholds for continuing or stopping.",
    ],
    strategy: [
      `For ${caseSeed.title}, I would compare customer demand, competitor strength, and our right to win before choosing a direction.`,
      "I see two plausible options and would favor the lower-investment entry, though the market sizing and economic assumptions remain rough.",
      "I would validate demand with a pilot and revisit the recommendation, but I have not set a precise trigger for expansion or exit.",
    ],
    behavioral: [
      `In the ${caseSeed.title} example, I owned one part of a team problem and needed to align two stakeholders with different priorities.`,
      "I gathered their concerns, proposed a compromise, and followed up, although the hardest tradeoff and my personal influence are not fully clear.",
      "The team completed the work with a better relationship, but the result is only loosely measured and my reflection could be more specific.",
    ],
  };
  return average[roundType];
}

function buildConversation(
  id: string,
  answers: string[],
  state: "full" | "partial"
): CalibrationTranscriptTurn[] {
  const turns: Array<
    readonly ["user" | "interviewer", string, number, number]
  > = [];
  const spacing = state === "full" ? 130 : 150;
  answers.forEach((answer, index) => {
    const base = index * spacing;
    turns.push([
      "interviewer",
      index === 0
        ? "Please frame your approach and make the first decision explicit."
        : `Follow-up ${index}: explain the next decision and its tradeoff.`,
      base,
      base + 10,
    ]);
    turns.push(["user", answer, base + 20, base + 70]);
  });
  return timedTurns(id, turns);
}

function timedTurns(
  id: string,
  turns: readonly (readonly ["user" | "interviewer", string, number, number])[]
): CalibrationTranscriptTurn[] {
  const start = Date.parse("2026-07-01T12:00:00.000Z");
  let userSequence = 0;
  let interviewerSequence = 0;
  return turns.map(([speaker, text, startedSeconds, endedSeconds]) => {
    const sequence =
      speaker === "user" ? ++userSequence : ++interviewerSequence;
    return {
      contractVersion: 2,
      eventId: `${id}:${speaker}:${sequence}`,
      speaker,
      text,
      startedAt: new Date(start + startedSeconds * 1000),
      endedAt: new Date(start + endedSeconds * 1000),
    };
  });
}

function fullSessionExtensions(caseSeed: ScoredSeed): string[] {
  const [frame, decision, metric] = caseSeed.answers;
  return [
    `For the first delivery checkpoint, I would turn this framing into one falsifiable assumption: ${frame}`,
    `I would ask design to test comprehension before polishing breadth, using this decision as the boundary: ${decision}`,
    `I would ask engineering to expose the riskiest dependency early and keep the first release reversible.`,
    `The weekly operating review would compare the leading behavior with this outcome: ${metric}`,
    `If the evidence contradicted the plan, I would narrow scope and record which assumption changed.`,
    `I would communicate the choice, the rejected alternative, and the owner of the next decision to every stakeholder.`,
    `Before scaling, I would review segmented outcomes and guardrails rather than rely on one aggregate average.`,
  ];
}

function toBands(expected: FeedbackV2Scores): CalibrationScoreBands {
  return Object.fromEntries(
    Object.entries(expected).map(([dimension, score]) => [
      dimension,
      { minimum: Math.max(0, score - 1), maximum: Math.min(10, score + 1) },
    ])
  ) as CalibrationScoreBands;
}

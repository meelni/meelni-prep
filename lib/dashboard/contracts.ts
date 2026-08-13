import { getCompletedFeedbackScore, parseRubricScore } from "@meelni/core";
import type { DashboardFeedbackPresentationKind } from "./feedback-presentation";

export interface DashboardFeedback {
  status?: string | null;
  presentationKind?: DashboardFeedbackPresentationKind;
  overallScore?: string | number | null;
  structureScore?: string | number | null;
  clarityScore?: string | number | null;
  insightScore?: string | number | null;
  communicationScore?: string | number | null;
  leadershipScore?: string | number | null;
}

export interface DashboardSessionInput {
  id: string;
  roundType: string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  feedback?: DashboardFeedback | null;
}

export interface DashboardQuestionInput {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt?: Date | string | null;
  isActive?: boolean | null;
}

export type DashboardFeedbackDisplayState =
  | "ready"
  | "processing"
  | "unavailable"
  | "not-generated"
  | "unscored";

export interface DashboardProgressBar {
  score: number;
  value: number;
  dateLabel?: string;
  roundLabel?: string;
}

export interface DashboardFocusArea {
  key: string;
  label: string;
  score: number;
  description: string;
}

export interface DashboardPracticeSummary {
  isNewUser: boolean;
  progress: {
    state: "empty" | "single" | "trend";
    score: number | null;
    scoredInterviewCount: number;
    label: string;
    description: string;
    deltaLabel: string;
  };
  focusArea: DashboardFocusArea | null;
  recommendation: {
    title: string;
    description: string;
    eyebrow: string;
    roundType: string;
    experienceLevel: string;
    creditLabel: string;
    href: string;
  };
  lastFeedback: {
    sessionId: string;
    label: string;
    summary: string;
    href: string;
  } | null;
  prepPlan: Array<{
    label: string;
    title: string;
    description: string;
    active?: boolean;
  }>;
  recentInterviews: Array<{
    id: string;
    dateLabel: string;
    roundLabel: string;
    focusLabel: string;
    scoreLabel: string;
    statusLabel: string;
    feedbackState: DashboardFeedbackDisplayState;
    feedbackKind: Exclude<
      DashboardFeedbackPresentationKind,
      "unavailable"
    > | null;
    feedbackHref: string | null;
  }>;
  progressSignal: {
    bars: DashboardProgressBar[];
    description: string;
  };
}

export interface QuestionBankSummary {
  totalActive: number;
  roundCounts: Record<string, number>;
  companyCounts: Record<string, number>;
  recommendedQuestion: DashboardQuestionInput | null;
}

export interface HistorySummary {
  nextReview: {
    countLabel: string;
    title: string;
    description: string;
    feedbackHref: string | null;
    repeatHref: string;
  };
  filters: string[];
  rows: Array<{
    id: string;
    dateLabel: string;
    roundLabel: string;
    questionLabel: string;
    focusLabel: string;
    scoreLabel: string;
    statusLabel: string;
    feedbackState: DashboardFeedbackDisplayState;
    feedbackKind: Exclude<
      DashboardFeedbackPresentationKind,
      "unavailable"
    > | null;
    feedbackHref: string | null;
    repeatHref: string;
  }>;
  patterns: Array<{
    label: string;
    count: number;
    description: string;
  }>;
}

const ROUND_LABELS: Record<string, string> = {
  product_sense: "Product Sense",
  execution: "Execution",
  analytical: "Execution",
  behavioral: "Behavioral",
  leadership: "Behavioral",
  strategy: "Strategy",
};

const FOCUS_AREAS = [
  {
    key: "structure",
    label: "Structure",
    description:
      "Open with a cleaner product frame before exploring solutions.",
  },
  {
    key: "clarity",
    label: "Clarity",
    description: "Make the main point easier to follow before adding detail.",
  },
  {
    key: "insight",
    label: "Metrics depth",
    description: "Name success metrics, guardrails, and tradeoffs earlier.",
  },
  {
    key: "communication",
    label: "Executive communication",
    description: "Keep the answer crisp enough for an interviewer to track.",
  },
  {
    key: "leadership",
    label: "Leadership specificity",
    description: "Ground judgment calls in concrete product and team signals.",
  },
] as const;

type FocusKey = (typeof FOCUS_AREAS)[number]["key"];

export function formatRoundType(roundType: string | null | undefined) {
  if (!roundType) return "Product Sense";
  return (
    ROUND_LABELS[roundType] ||
    roundType
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function buildDashboardPracticeSummary(
  sessions: DashboardSessionInput[]
): DashboardPracticeSummary {
  const sortedSessions = [...sessions].sort(
    (a, b) => getTime(b.startedAt) - getTime(a.startedAt)
  );
  const scoredSessions = sortedSessions.filter(
    (session) => getDashboardScoredFeedbackScore(session.feedback) !== null
  );
  const latestScored = scoredSessions[0] ?? null;
  const latestReviewable =
    sortedSessions.find(
      (session) => getDashboardFeedbackReviewKind(session.feedback) !== null
    ) ?? null;
  const recentScoredSessions = scoredSessions.slice(0, 5);
  const recentScores = recentScoredSessions
    .map((session) => getDashboardScoredFeedbackScore(session.feedback))
    .filter((score): score is number => score !== null);
  const chronologicalScoredSessions = [...recentScoredSessions].reverse();
  const progressScore =
    recentScores.length > 0
      ? roundToOneDecimal(
          recentScores.reduce((sum, score) => sum + score, 0) /
            recentScores.length
        )
      : null;
  const focusArea = getFocusArea(latestScored?.feedback);
  const latestRound = formatRoundType(latestScored?.roundType);
  const roundParam = latestScored?.roundType || "product_sense";
  const isNewUser = sortedSessions.length === 0;
  const progressState =
    recentScores.length === 0
      ? "empty"
      : recentScores.length === 1
        ? "single"
        : "trend";
  const bestSignal = getBestSignal(latestScored?.feedback);

  return {
    isNewUser,
    progress: {
      state: progressState,
      score: progressScore,
      scoredInterviewCount: scoredSessions.length,
      label:
        progressState === "empty"
          ? "No scored interviews yet"
          : progressState === "single"
            ? "Latest scored interview"
            : `Recent ${recentScores.length}-interview average`,
      description:
        progressState === "empty"
          ? sortedSessions.length > 0
            ? "Your interview history is saved. Progress appears after feedback is completed with a valid score."
            : "Complete one mock interview to establish your first scored practice signal."
          : progressState === "single"
            ? "This is the observed score from your latest completed feedback."
            : `Average of your ${recentScores.length} most recent completed, scored interviews.`,
      deltaLabel: getDeltaLabel(recentScores),
    },
    focusArea,
    recommendation: !latestScored
      ? {
          title: isNewUser
            ? "Start your first PM mock interview."
            : "Complete another PM mock interview.",
          description:
            "Completed, scored feedback will shape the next evidence-based practice target.",
          eyebrow: isNewUser ? "First interview" : "Next interview",
          roundType: "Product Sense",
          experienceLevel: "IC PM",
          creditLabel: "1 credit",
          href: "/dashboard/new-interview",
        }
      : focusArea
        ? {
            title: `Sharpen ${formatFocusPhrase(focusArea.label)} before your next ${latestRound.toLowerCase()} interview.`,
            description: focusArea.description,
            eyebrow: "Based on feedback",
            roundType: latestRound,
            experienceLevel: "IC PM",
            creditLabel: "1 credit",
            href: `/dashboard/new-interview?interview_type=${encodeURIComponent(roundParam)}`,
          }
        : {
            title: `Repeat a ${latestRound} mock interview.`,
            description:
              "Use your latest completed feedback to choose one improvement before you start.",
            eyebrow: "Next interview",
            roundType: latestRound,
            experienceLevel: "IC PM",
            creditLabel: "1 credit",
            href: `/dashboard/new-interview?interview_type=${encodeURIComponent(roundParam)}`,
          },
    lastFeedback: latestReviewable
      ? {
          sessionId: latestReviewable.id,
          label: "Latest feedback",
          summary:
            latestReviewable === latestScored && bestSignal && focusArea
              ? `Highest scored dimension: ${bestSignal}. Lowest scored dimension: ${focusArea.label}.`
              : getDashboardFeedbackReviewKind(latestReviewable.feedback) ===
                    "evidence_limited" ||
                  getDashboardFeedbackReviewKind(latestReviewable.feedback) ===
                    "coaching_review"
                ? `Open the grounded observations from your latest ${formatRoundType(latestReviewable.roundType).toLowerCase()} interview. No numerical score was inferred.`
                : `Open the completed feedback from your latest ${formatRoundType(latestReviewable.roundType).toLowerCase()} interview.`,
          href: `/feedback/${latestReviewable.id}`,
        }
      : null,
    prepPlan: [
      {
        label: "Today",
        title: !latestScored
          ? isNewUser
            ? "First Product Sense interview"
            : "Next Product Sense interview"
          : `${latestRound} interview`,
        description: !latestScored
          ? "Answer one real PM prompt out loud."
          : focusArea?.description ||
            "Repeat the round using one improvement from your completed feedback.",
        active: true,
      },
      {
        label: "Next",
        title: focusArea
          ? `${focusArea.label} focused practice`
          : "Review feedback",
        description: focusArea
          ? `Practice the lowest scored dimension from your latest completed feedback.`
          : "Choose one concrete improvement from completed feedback.",
      },
      {
        label: "Later",
        title: "Company question",
        description: "Apply the same structure to a target-company prompt.",
      },
    ],
    recentInterviews: sortedSessions.slice(0, 4).map((session) => {
      const score = getDashboardScoredFeedbackScore(session.feedback);
      const rowFocus = getFocusArea(session.feedback);
      const display = getFeedbackDisplay(session.feedback, rowFocus);
      const reviewKind = getDashboardFeedbackReviewKind(session.feedback);
      return {
        id: session.id,
        dateLabel: formatSessionDate(session.startedAt),
        roundLabel: formatRoundType(session.roundType),
        focusLabel: display.focusLabel,
        scoreLabel: score === null ? display.scoreLabel : score.toFixed(1),
        statusLabel: display.statusLabel,
        feedbackState: display.feedbackState,
        feedbackKind: reviewKind,
        feedbackHref: reviewKind ? `/feedback/${session.id}` : null,
      };
    }),
    progressSignal: {
      bars: buildProgressBars(recentScores).map((bar, index) => {
        const session = chronologicalScoredSessions[index];

        return {
          ...bar,
          dateLabel: session ? formatSessionDate(session.startedAt) : undefined,
          roundLabel: session ? formatRoundType(session.roundType) : undefined,
        };
      }),
      description: getProgressSignalDescription(recentScores),
    },
  };
}

export function buildQuestionBankSummary(
  questions: DashboardQuestionInput[]
): QuestionBankSummary {
  const activeQuestions = questions.filter(
    (question) => question.isActive !== false
  );
  const roundCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};

  for (const question of activeQuestions) {
    const roundLabel = formatRoundType(question.questionType);
    roundCounts[roundLabel] = (roundCounts[roundLabel] || 0) + 1;

    if (question.company) {
      companyCounts[question.company] =
        (companyCounts[question.company] || 0) + 1;
    }
  }

  const recommendedQuestion =
    activeQuestions.find(
      (question) => question.questionType === "product_sense"
    ) ||
    activeQuestions[0] ||
    null;

  return {
    totalActive: activeQuestions.length,
    roundCounts,
    companyCounts,
    recommendedQuestion,
  };
}

export function buildHistorySummary(
  sessions: DashboardSessionInput[]
): HistorySummary {
  const sortedSessions = [...sessions].sort(
    (a, b) => getTime(b.startedAt) - getTime(a.startedAt)
  );
  const rows = sortedSessions.map((session) => {
    const focus = getFocusArea(session.feedback);
    const score = getDashboardScoredFeedbackScore(session.feedback);
    const hasScore = score !== null;
    const roundLabel = formatRoundType(session.roundType);
    const display = getFeedbackDisplay(session.feedback, focus);
    const reviewKind = getDashboardFeedbackReviewKind(session.feedback);

    return {
      id: session.id,
      dateLabel: formatSessionDate(session.startedAt),
      roundLabel,
      questionLabel: getSessionQuestionLabel(session),
      focusLabel: display.focusLabel,
      scoreLabel: hasScore ? score.toFixed(1) : display.scoreLabel,
      statusLabel: display.statusLabel,
      feedbackState: display.feedbackState,
      feedbackKind: reviewKind,
      feedbackHref: reviewKind ? `/feedback/${session.id}` : null,
      repeatHref: `/dashboard/new-interview?interview_type=${encodeURIComponent(session.roundType || "product_sense")}`,
    };
  });

  const focusCounts = new Map<string, number>();
  for (const session of sortedSessions) {
    if (getDashboardScoredFeedbackScore(session.feedback) === null) continue;
    const focus = getFocusArea(session.feedback);
    if (!focus) continue;
    focusCounts.set(focus.label, (focusCounts.get(focus.label) || 0) + 1);
  }
  const patterns = Array.from(focusCounts.entries())
    .map(([label, count]) => ({
      label,
      count,
      description:
        count === 1
          ? `${label} was the lowest scored dimension in your latest scored feedback. Complete more interviews before treating it as a pattern.`
          : `${label} was the lowest scored dimension in ${count} completed interviews.`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topPattern = patterns[0] ?? null;
  const latestReady = rows.find((row) => row.feedbackHref);
  const latestScoredReady = rows.find(
    (row) =>
      (row.feedbackKind === "scored" ||
        row.feedbackKind === "full_scorecard") &&
      row.feedbackHref
  );
  const nextReviewRow = topPattern ? latestScoredReady : latestReady;

  return {
    nextReview: {
      countLabel: topPattern ? `${topPattern.count}x` : latestReady ? "1" : "—",
      title: topPattern
        ? topPattern.count > 1
          ? `${topPattern.label} repeats across scored interviews`
          : `${topPattern.label} is the lowest scored dimension in your latest feedback`
        : latestReady
          ? "Review your latest feedback"
          : "No scored feedback to review yet",
      description:
        topPattern?.description ||
        (latestReady
          ? "No dimension-level pattern is available yet. Review the completed feedback before your next interview."
          : "Complete a mock interview and its feedback to reveal evidence-based practice patterns."),
      feedbackHref: nextReviewRow?.feedbackHref || null,
      repeatHref: nextReviewRow?.repeatHref || "/dashboard/new-interview",
    },
    filters: [
      "All interviews",
      ...Array.from(new Set(rows.map((row) => row.roundLabel))),
    ],
    rows,
    patterns,
  };
}

export function getFocusArea(
  feedback?: DashboardFeedback | null
): DashboardFocusArea | null {
  if (getDashboardScoredFeedbackScore(feedback) === null) return null;

  const scoredAreas = FOCUS_AREAS.map((area) => ({
    ...area,
    score: parseRubricScore(
      feedback?.[`${area.key}Score` as `${FocusKey}Score`]
    ),
  })).filter(
    (area): area is typeof area & { score: number } => area.score !== null
  );

  if (scoredAreas.length === 0) {
    return null;
  }

  const weakest = scoredAreas.reduce((lowest, area) =>
    area.score! < lowest.score! ? area : lowest
  );

  return {
    key: weakest.key,
    label: weakest.label,
    score: weakest.score,
    description: weakest.description,
  };
}

export function parseScore(score: string | number | null | undefined) {
  return parseRubricScore(score) ?? Number.NaN;
}

function getBestSignal(feedback?: DashboardFeedback | null) {
  if (getDashboardScoredFeedbackScore(feedback) === null) return null;

  const scoredAreas = FOCUS_AREAS.map((area) => ({
    label: area.label,
    score: parseRubricScore(
      feedback?.[`${area.key}Score` as `${FocusKey}Score`]
    ),
  })).filter(
    (area): area is typeof area & { score: number } => area.score !== null
  );

  if (scoredAreas.length === 0) return null;
  return scoredAreas.reduce((best, area) =>
    area.score! > best.score! ? area : best
  ).label;
}

function getDeltaLabel(scores: number[]) {
  if (scores.length === 0) return "No scored interviews";
  if (scores.length === 1) return "1 scored interview";
  const delta = scores[0]! - scores[scores.length - 1]!;
  const rounded = roundToOneDecimal(delta);
  if (rounded === 0)
    return `No score change across ${scores.length} interviews`;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} points across ${scores.length} interviews`;
}

export function buildProgressBars(scores: number[], targetSlots = 5) {
  return [...scores]
    .reverse()
    .slice(-targetSlots)
    .map(parseRubricScore)
    .filter((score): score is number => score !== null)
    .map((score) => ({
      score,
      value: score * 10,
    }));
}

function getFeedbackDisplay(
  feedback: DashboardFeedback | null | undefined,
  focusArea: DashboardFocusArea | null
) {
  const reviewKind = getDashboardFeedbackReviewKind(feedback);
  if (reviewKind === "scored") {
    return {
      focusLabel: focusArea?.label || "Scored feedback",
      scoreLabel: "Scored",
      statusLabel: "Feedback ready",
      feedbackState: "ready" as const,
    };
  }
  if (reviewKind === "full_scorecard") {
    return {
      focusLabel: focusArea?.label || "Complete scorecard",
      scoreLabel: "Scored",
      statusLabel: "Feedback ready",
      feedbackState: "ready" as const,
    };
  }
  if (reviewKind === "partial_scorecard") {
    return {
      focusLabel: "Scores for supported PM dimensions",
      scoreLabel: "Partial scores",
      statusLabel: "Feedback ready — partial scorecard",
      feedbackState: "ready" as const,
    };
  }
  if (reviewKind === "evidence_limited" || reviewKind === "coaching_review") {
    return {
      focusLabel: "Grounded observations from your recorded answers",
      scoreLabel: "No score",
      statusLabel: "Feedback ready — no score",
      feedbackState: "ready" as const,
    };
  }

  switch (feedback?.status) {
    case "pending":
    case "processing":
      return {
        focusLabel: "Feedback is being prepared",
        scoreLabel: "Not scored yet",
        statusLabel: "Feedback processing",
        feedbackState: "processing" as const,
      };
    case "failed":
      return {
        focusLabel:
          "Feedback generation failed. Your interview is still saved.",
        scoreLabel: "Not scored",
        statusLabel: "Feedback failed",
        feedbackState: "unavailable" as const,
      };
    case "skipped":
      return {
        focusLabel: "This interview ended without generated feedback.",
        scoreLabel: "Not scored",
        statusLabel: "Feedback not generated",
        feedbackState: "not-generated" as const,
      };
    case "completed":
      return {
        focusLabel:
          "This completed feedback could not be validated for review.",
        scoreLabel: "Not scored",
        statusLabel: "Feedback unavailable",
        feedbackState: "unavailable" as const,
      };
    default:
      return {
        focusLabel: "No feedback result is available for this interview.",
        scoreLabel: "Not scored",
        statusLabel: "Feedback unavailable",
        feedbackState: "unscored" as const,
      };
  }
}

function getDashboardFeedbackReviewKind(
  feedback: DashboardFeedback | null | undefined
): Exclude<DashboardFeedbackPresentationKind, "unavailable"> | null {
  if (feedback?.presentationKind === "unavailable") return null;
  const score = getDashboardScoredFeedbackScore(feedback);
  if (
    feedback?.presentationKind === "scored" ||
    feedback?.presentationKind === "full_scorecard" ||
    (feedback?.presentationKind === undefined && score !== null)
  ) {
    return score === null ? null : (feedback?.presentationKind ?? "scored");
  }
  return score === null &&
    (feedback?.presentationKind === "evidence_limited" ||
      feedback?.presentationKind === "partial_scorecard" ||
      feedback?.presentationKind === "coaching_review")
    ? feedback.presentationKind
    : null;
}

function getDashboardScoredFeedbackScore(
  feedback: DashboardFeedback | null | undefined
): number | null {
  if (
    feedback?.presentationKind === "evidence_limited" ||
    feedback?.presentationKind === "partial_scorecard" ||
    feedback?.presentationKind === "coaching_review" ||
    feedback?.presentationKind === "unavailable"
  ) {
    return null;
  }
  return getCompletedFeedbackScore(feedback);
}

function getProgressSignalDescription(scores: number[]) {
  if (scores.length === 0) {
    return "No progress bars are shown until completed feedback includes a valid score.";
  }
  if (scores.length === 1) {
    return "One observed scored interview. Complete another to compare scores over time.";
  }

  const delta = roundToOneDecimal(scores[0]! - scores[scores.length - 1]!);
  if (delta === 0) {
    return `The ${scores.length} observed recent scores start and end at the same value.`;
  }
  return `Across ${scores.length} observed recent scores, the latest is ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? "higher" : "lower"} than the oldest.`;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function formatFocusPhrase(label: string) {
  return label === "Metrics depth" ? "metric depth" : label.toLowerCase();
}

function formatSessionDate(date: Date | string | null) {
  if (!date) return "No date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function getSessionQuestionLabel(session: DashboardSessionInput) {
  const config = session as DashboardSessionInput & {
    config?: { questionText?: unknown; question?: unknown };
  };
  const questionText = config.config?.questionText || config.config?.question;
  return typeof questionText === "string" && questionText.trim().length > 0
    ? questionText
    : "—";
}

function getTime(date: Date | string | null) {
  if (!date) return 0;
  return new Date(date).getTime();
}

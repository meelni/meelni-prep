import { getCompletedFeedbackScore, parseRubricScore } from "@meelni/core";

export interface DashboardFeedback {
  status?: string | null;
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

export interface DashboardProgressBar {
  score: number;
  value: number;
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
    difficulty: string;
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
    (session) => getCompletedFeedbackScore(session.feedback) !== null
  );
  const latestScored = scoredSessions[0] ?? null;
  const recentScores = scoredSessions
    .slice(0, 5)
    .map((session) => getCompletedFeedbackScore(session.feedback))
    .filter((score): score is number => score !== null);
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
          difficulty: "Intermediate",
          creditLabel: "1 credit",
          href: "/dashboard/new-interview",
        }
      : focusArea
        ? {
            title: `Sharpen ${formatFocusPhrase(focusArea.label)} before your next ${latestRound.toLowerCase()} interview.`,
            description: focusArea.description,
            eyebrow: "Based on feedback",
            roundType: latestRound,
            difficulty: "Intermediate",
            creditLabel: "1 credit",
            href: `/dashboard/new-interview?interview_type=${encodeURIComponent(roundParam)}`,
          }
        : {
            title: `Repeat a ${latestRound} mock interview.`,
            description:
              "Use your latest completed feedback to choose one improvement before you start.",
            eyebrow: "Next interview",
            roundType: latestRound,
            difficulty: "Intermediate",
            creditLabel: "1 credit",
            href: `/dashboard/new-interview?interview_type=${encodeURIComponent(roundParam)}`,
          },
    lastFeedback: latestScored
      ? {
          sessionId: latestScored.id,
          label: "Latest feedback",
          summary:
            bestSignal && focusArea
              ? `Highest scored dimension: ${bestSignal}. Lowest scored dimension: ${focusArea.label}.`
              : `Open the completed feedback from your latest ${latestRound.toLowerCase()} interview.`,
          href: `/feedback/${latestScored.id}`,
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
      const score = getCompletedFeedbackScore(session.feedback);
      const rowFocus = getFocusArea(session.feedback);
      const display = getFeedbackDisplay(session.feedback, rowFocus);
      return {
        id: session.id,
        dateLabel: formatSessionDate(session.startedAt),
        roundLabel: formatRoundType(session.roundType),
        focusLabel: display.focusLabel,
        scoreLabel: score === null ? display.scoreLabel : score.toFixed(1),
        feedbackHref: score === null ? null : `/feedback/${session.id}`,
      };
    }),
    progressSignal: {
      bars: buildProgressBars(recentScores),
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
    const score = getCompletedFeedbackScore(session.feedback);
    const hasScore = score !== null;
    const roundLabel = formatRoundType(session.roundType);
    const display = getFeedbackDisplay(session.feedback, focus);

    return {
      id: session.id,
      dateLabel: formatSessionDate(session.startedAt),
      roundLabel,
      questionLabel: getSessionQuestionLabel(session),
      focusLabel: display.focusLabel,
      scoreLabel: hasScore ? score.toFixed(1) : display.scoreLabel,
      statusLabel: display.statusLabel,
      feedbackHref: hasScore ? `/feedback/${session.id}` : null,
      repeatHref: `/dashboard/new-interview?interview_type=${encodeURIComponent(session.roundType || "product_sense")}`,
    };
  });

  const focusCounts = new Map<string, number>();
  for (const session of sortedSessions) {
    const focus = getFocusArea(session.feedback);
    if (!focus) continue;
    focusCounts.set(focus.label, (focusCounts.get(focus.label) || 0) + 1);
  }
  const patterns = Array.from(focusCounts.entries())
    .map(([label, count]) => ({
      label,
      count,
      description: `${label} was the lowest scored dimension in ${count} completed interview${count === 1 ? "" : "s"}.`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topPattern = patterns[0] ?? null;
  const latestReady = rows.find((row) => row.feedbackHref);

  return {
    nextReview: {
      countLabel: topPattern ? `${topPattern.count}x` : latestReady ? "1" : "—",
      title: topPattern
        ? topPattern.count > 1
          ? `${topPattern.label} repeats across scored interviews`
          : `${topPattern.label} is the lowest scored dimension in your latest feedback`
        : latestReady
          ? "Review your latest scored interview"
          : "No scored feedback to review yet",
      description:
        topPattern?.description ||
        (latestReady
          ? "No dimension-level pattern is available yet. Review the completed feedback before your next interview."
          : "Complete a mock interview and its feedback to reveal evidence-based practice patterns."),
      feedbackHref: latestReady?.feedbackHref || null,
      repeatHref: latestReady?.repeatHref || "/dashboard/new-interview",
    },
    filters: ["All interviews", "Product Sense", "Execution", "Behavioral"],
    rows,
    patterns,
  };
}

export function getFocusArea(
  feedback?: DashboardFeedback | null
): DashboardFocusArea | null {
  if (getCompletedFeedbackScore(feedback) === null) return null;

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
  if (getCompletedFeedbackScore(feedback) === null) return null;

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
  if (getCompletedFeedbackScore(feedback) !== null) {
    return {
      focusLabel: focusArea?.label || "Scored feedback",
      scoreLabel: "Scored",
      statusLabel: "Feedback ready",
    };
  }

  switch (feedback?.status) {
    case "pending":
    case "processing":
      return {
        focusLabel: "Feedback pending",
        scoreLabel: "Pending",
        statusLabel: "Processing",
      };
    case "failed":
      return {
        focusLabel: "Feedback failed",
        scoreLabel: "Unavailable",
        statusLabel: "Feedback failed",
      };
    case "skipped":
      return {
        focusLabel: "Feedback skipped",
        scoreLabel: "Skipped",
        statusLabel: "Feedback skipped",
      };
    case "completed":
      return {
        focusLabel: "Score unavailable",
        scoreLabel: "Unscored",
        statusLabel: "Score unavailable",
      };
    default:
      return {
        focusLabel: "Not scored",
        scoreLabel: "Not scored",
        statusLabel: "Not scored",
      };
  }
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
  return typeof questionText === "string"
    ? questionText
    : `${formatRoundType(session.roundType)} mock interview`;
}

function getTime(date: Date | string | null) {
  if (!date) return 0;
  return new Date(date).getTime();
}

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
  value: number;
  state: "actual" | "placeholder";
}

export interface DashboardPracticeSummary {
  isNewUser: boolean;
  readiness: {
    score: number;
    label: string;
    description: string;
    deltaLabel: string;
  };
  focusArea: {
    key: string;
    label: string;
    score: number | null;
    description: string;
  };
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
  recentReps: Array<{
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
    description: "Open with a cleaner product frame before exploring solutions.",
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
  const scoredSessions = sortedSessions.filter((session) =>
    Number.isFinite(parseScore(session.feedback?.overallScore))
  );
  const latestScored = scoredSessions[0] ?? null;
  const recentScores = scoredSessions
    .slice(0, 5)
    .map((session) => parseScore(session.feedback?.overallScore))
    .filter((score): score is number => Number.isFinite(score));
  const avgScore =
    recentScores.length > 0
      ? recentScores.reduce((sum, score) => sum + score, 0) /
        recentScores.length
      : 0;
  const readinessScore = Math.round(Math.min(100, Math.max(0, avgScore * 10)));
  const focusArea = getFocusArea(latestScored?.feedback);
  const latestRound = formatRoundType(latestScored?.roundType);
  const roundParam = latestScored?.roundType || "product_sense";
  const isNewUser = sortedSessions.length === 0;

  return {
    isNewUser,
    readiness: {
      score: readinessScore,
      label:
        readinessScore >= 78
          ? "Interview-ready"
          : readinessScore >= 55
            ? "Building"
            : "Early signal",
      description:
        readinessScore > 0
          ? `${latestRound} structure is improving; ${focusArea.label.toLowerCase()} is the bottleneck.`
          : "Start with one focused rep so Meelni can calibrate your next action.",
      deltaLabel: getDeltaLabel(recentScores),
    },
    focusArea,
    recommendation: isNewUser
      ? {
          title: "Start your first PM interview rep.",
          description:
            "Begin with a Product Sense mock interview so your feedback and practice plan can calibrate around real answers.",
          eyebrow: "First rep",
          roundType: "Product Sense",
          difficulty: "Intermediate",
          creditLabel: "1 credit",
          href: "/setup",
        }
      : {
          title: `Sharpen ${formatFocusPhrase(focusArea.label)} before your next ${latestRound.toLowerCase()} loop.`,
          description: focusArea.description,
          eyebrow: "Recommended",
          roundType: latestRound,
          difficulty: "Intermediate",
          creditLabel: "1 credit",
          href: `/setup?interview_type=${encodeURIComponent(roundParam)}`,
        },
    lastFeedback: latestScored
      ? {
          sessionId: latestScored.id,
          label: "Latest feedback",
        summary: `Strongest signal: ${getBestSignal(latestScored.feedback)}. Focus next on ${focusArea.label.toLowerCase()}.`,
          href: `/feedback/${latestScored.id}`,
        }
      : null,
    prepPlan: [
      {
        label: "Today",
        title: isNewUser ? "First Product Sense rep" : `${latestRound} rep`,
        description: isNewUser
          ? "Answer one real PM prompt out loud."
          : focusArea.description,
        active: true,
      },
      {
        label: "Next",
        title: `${focusArea.label} drill`,
        description: "Repeat the opening with outcome, metric, and guardrail.",
      },
      {
        label: "Later",
        title: "Company question",
        description: "Apply the same structure to a target-company prompt.",
      },
    ],
    recentReps: sortedSessions.slice(0, 4).map((session) => {
      const score = parseScore(session.feedback?.overallScore);
      const rowFocus = getFocusArea(session.feedback);
      return {
        id: session.id,
        dateLabel: formatSessionDate(session.startedAt),
        roundLabel: formatRoundType(session.roundType),
        focusLabel:
          session.feedback?.status === "pending" ||
          session.feedback?.status === "processing"
            ? "Feedback pending"
            : rowFocus.label,
        scoreLabel: Number.isFinite(score) ? score.toFixed(1) : "Pending",
        feedbackHref: Number.isFinite(score) ? `/feedback/${session.id}` : null,
      };
    }),
    progressSignal: {
      bars: buildProgressBars(recentScores),
      description:
        recentScores.length >= 2 && recentScores[0]! >= recentScores.at(-1)!
          ? "Your recent reps show steady improvement. Keep the next rep focused on one bottleneck."
          : "Complete a few more reps to make the progress signal reliable.",
    },
  };
}

export function buildQuestionBankSummary(
  questions: DashboardQuestionInput[]
): QuestionBankSummary {
  const activeQuestions = questions.filter((question) => question.isActive !== false);
  const roundCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};

  for (const question of activeQuestions) {
    const roundLabel = formatRoundType(question.questionType);
    roundCounts[roundLabel] = (roundCounts[roundLabel] || 0) + 1;

    if (question.company) {
      companyCounts[question.company] = (companyCounts[question.company] || 0) + 1;
    }
  }

  const recommendedQuestion =
    activeQuestions.find((question) => question.questionType === "product_sense") ||
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
    const score = parseScore(session.feedback?.overallScore);
    const hasScore = Number.isFinite(score);
    const roundLabel = formatRoundType(session.roundType);

    return {
      id: session.id,
      dateLabel: formatSessionDate(session.startedAt),
      roundLabel,
      questionLabel: getSessionQuestionLabel(session),
      focusLabel:
        session.feedback?.status === "pending" ||
        session.feedback?.status === "processing"
          ? "Feedback pending"
          : focus.label,
      scoreLabel: hasScore ? score.toFixed(1) : "Pending",
      statusLabel: hasScore ? "Feedback ready" : "Processing",
      feedbackHref: hasScore ? `/feedback/${session.id}` : null,
      repeatHref: `/setup?interview_type=${encodeURIComponent(session.roundType || "product_sense")}`,
    };
  });

  const focusCounts = new Map<string, number>();
  for (const session of sortedSessions) {
    const focus = getFocusArea(session.feedback);
    focusCounts.set(focus.label, (focusCounts.get(focus.label) || 0) + 1);
  }
  const patterns = Array.from(focusCounts.entries())
    .map(([label, count]) => ({
      label,
      count,
      description:
        label === "Metrics depth"
          ? "Success metrics still arrive late."
          : `${label} has appeared across recent feedback.`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topPattern = patterns[0] || {
    label: "Metrics depth",
    count: 0,
    description: "Complete feedback to reveal repeated patterns.",
  };
  const latestReady = rows.find((row) => row.feedbackHref);

  return {
    nextReview: {
      countLabel: `${Math.max(topPattern.count, latestReady ? 1 : 0)}x`,
      title: `${topPattern.label} is repeating across recent reps`,
      description:
        topPattern.count > 1
          ? "Open the latest feedback, then repeat the same weakness with the fix stated earlier."
          : "Open your latest feedback, then repeat the prompt while the lesson is still fresh.",
      feedbackHref: latestReady?.feedbackHref || null,
      repeatHref: latestReady?.repeatHref || "/setup",
    },
    filters: ["All reps", "Product Sense", "Execution", "Behavioral"],
    rows,
    patterns,
  };
}

export function getFocusArea(feedback?: DashboardFeedback | null) {
  const scoredAreas = FOCUS_AREAS.map((area) => ({
    ...area,
    score: parseScore(feedback?.[`${area.key}Score` as `${FocusKey}Score`]),
  })).filter((area) => Number.isFinite(area.score));

  if (scoredAreas.length === 0) {
    return {
      key: "insight",
      label: "Metrics depth",
      score: null,
      description: "Name success metrics, guardrails, and tradeoffs earlier.",
    };
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
  if (score === null || score === undefined || score === "") return Number.NaN;
  return typeof score === "number" ? score : Number.parseFloat(score);
}

function getBestSignal(feedback?: DashboardFeedback | null) {
  const scoredAreas = FOCUS_AREAS.map((area) => ({
    label: area.label,
    score: parseScore(feedback?.[`${area.key}Score` as `${FocusKey}Score`]),
  })).filter((area) => Number.isFinite(area.score));

  if (scoredAreas.length === 0) return "structure";
  return scoredAreas.reduce((best, area) =>
    area.score! > best.score! ? area : best
  ).label;
}

function getDeltaLabel(scores: number[]) {
  if (scores.length < 2) return "Needs more reps";
  const delta = scores[0]! - scores[scores.length - 1]!;
  const rounded = Math.round(delta * 10);
  if (rounded === 0) return "Flat over recent reps";
  return `${rounded > 0 ? "+" : ""}${rounded} over last ${scores.length} reps`;
}

export function buildProgressBars(scores: number[], targetSlots = 5) {
  const chronological = [...scores].reverse().slice(-targetSlots);
  const actualBars = chronological.map((score) => ({
    value: Math.max(12, Math.min(100, score * 10)),
    state: "actual" as const,
  }));

  const remainingSlots = Math.max(0, targetSlots - actualBars.length);
  if (remainingSlots === 0) return actualBars;

  const lastActual = actualBars.at(-1)?.value ?? 30;
  const placeholders = Array.from({ length: remainingSlots }, (_, index) => {
    const step = actualBars.length === 0 ? 12 : 8;
    return {
      value: Math.max(12, Math.min(100, lastActual + step * (index + 1))),
      state: "placeholder" as const,
    };
  });

  return [...actualBars, ...placeholders];
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
    : `${formatRoundType(session.roundType)} practice rep`;
}

function getTime(date: Date | string | null) {
  if (!date) return 0;
  return new Date(date).getTime();
}

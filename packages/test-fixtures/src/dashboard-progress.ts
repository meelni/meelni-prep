export interface DashboardProgressFeedbackFixture {
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  overallScore: string | number | null;
  structureScore?: number | null;
  clarityScore?: number | null;
  insightScore?: number | null;
  communicationScore?: number | null;
  leadershipScore?: number | null;
}

export interface DashboardProgressSessionFixture {
  id: string;
  roundType: string;
  startedAt: string;
  endedAt: string | null;
  feedback?: DashboardProgressFeedbackFixture | null;
}

const completedSession: DashboardProgressSessionFixture = {
  id: "dashboard-completed-1",
  roundType: "product_sense",
  startedAt: "2026-07-05T12:00:00.000Z",
  endedAt: "2026-07-05T12:28:00.000Z",
  feedback: {
    status: "completed",
    overallScore: "6.2",
    structureScore: 8.1,
    clarityScore: 7.4,
    insightScore: 5.9,
    communicationScore: 7.1,
    leadershipScore: 6.8,
  },
};

const statusSessions: DashboardProgressSessionFixture[] = [
  {
    id: "dashboard-pending",
    roundType: "execution",
    startedAt: "2026-07-10T12:00:00.000Z",
    endedAt: "2026-07-10T12:20:00.000Z",
    feedback: { status: "pending", overallScore: "9.9", insightScore: 1 },
  },
  {
    id: "dashboard-processing",
    roundType: "strategy",
    startedAt: "2026-07-09T12:00:00.000Z",
    endedAt: "2026-07-09T12:20:00.000Z",
    feedback: {
      status: "processing",
      overallScore: "9.8",
      insightScore: 1,
    },
  },
  {
    id: "dashboard-failed",
    roundType: "behavioral",
    startedAt: "2026-07-08T12:00:00.000Z",
    endedAt: "2026-07-08T12:20:00.000Z",
    feedback: { status: "failed", overallScore: "9.7", insightScore: 1 },
  },
  {
    id: "dashboard-skipped",
    roundType: "product_sense",
    startedAt: "2026-07-07T12:00:00.000Z",
    endedAt: "2026-07-07T12:01:00.000Z",
    feedback: { status: "skipped", overallScore: "9.6", insightScore: 1 },
  },
  {
    id: "dashboard-unscored",
    roundType: "execution",
    startedAt: "2026-07-06T12:00:00.000Z",
    endedAt: "2026-07-06T12:20:00.000Z",
    feedback: { status: "completed", overallScore: null, insightScore: 1 },
  },
  completedSession,
];

export function createDashboardProgressFixtures() {
  return structuredClone({
    zero: [] as DashboardProgressSessionFixture[],
    one: [completedSession],
    many: [
      {
        ...completedSession,
        id: "dashboard-completed-3",
        startedAt: "2026-07-07T12:00:00.000Z",
        feedback: {
          ...completedSession.feedback!,
          overallScore: "7.4",
          insightScore: 6.4,
        },
      },
      {
        ...completedSession,
        id: "dashboard-completed-2",
        startedAt: "2026-07-06T12:00:00.000Z",
        feedback: {
          ...completedSession.feedback!,
          overallScore: "6.8",
          insightScore: 6.1,
        },
      },
      completedSession,
    ],
    everyFeedbackStatus: statusSessions,
  });
}

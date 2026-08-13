export interface DashboardProgressFeedbackFixture {
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  presentationKind:
    | "scored"
    | "evidence_limited"
    | "unable_to_review"
    | "unavailable";
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
    presentationKind: "scored",
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
    feedback: {
      status: "pending",
      presentationKind: "unavailable",
      overallScore: "9.9",
      insightScore: 1,
    },
  },
  {
    id: "dashboard-processing",
    roundType: "strategy",
    startedAt: "2026-07-09T12:00:00.000Z",
    endedAt: "2026-07-09T12:20:00.000Z",
    feedback: {
      status: "processing",
      presentationKind: "unavailable",
      overallScore: "9.8",
      insightScore: 1,
    },
  },
  {
    id: "dashboard-failed",
    roundType: "behavioral",
    startedAt: "2026-07-08T12:00:00.000Z",
    endedAt: "2026-07-08T12:20:00.000Z",
    feedback: {
      status: "failed",
      presentationKind: "unavailable",
      overallScore: "9.7",
      insightScore: 1,
    },
  },
  {
    id: "dashboard-skipped",
    roundType: "product_sense",
    startedAt: "2026-07-07T12:00:00.000Z",
    endedAt: "2026-07-07T12:01:00.000Z",
    feedback: {
      status: "skipped",
      presentationKind: "unable_to_review",
      overallScore: null,
      insightScore: null,
    },
  },
  {
    id: "dashboard-evidence-limited",
    roundType: "execution",
    startedAt: "2026-07-06T12:00:00.000Z",
    endedAt: "2026-07-06T12:20:00.000Z",
    feedback: {
      status: "completed",
      presentationKind: "evidence_limited",
      overallScore: null,
      insightScore: null,
    },
  },
  {
    id: "dashboard-corrupt-completed",
    roundType: "execution",
    startedAt: "2026-07-05T18:00:00.000Z",
    endedAt: "2026-07-05T18:20:00.000Z",
    feedback: {
      status: "completed",
      presentationKind: "unavailable",
      overallScore: null,
      insightScore: null,
    },
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

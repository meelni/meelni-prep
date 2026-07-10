export interface AnalyticsInsightsResponse {
  overall?: {
    totalSessions?: number;
    total_sessions?: number;
    completedSessions?: number;
    completed_sessions?: number;
  };
  trends?: {
    improvementTrend?: "improving" | "stable" | "declining";
    improvement_trend?: "improving" | "stable" | "declining";
    velocity?: number;
  };
  competencies?: Record<string, number>;
}

export interface AnalyticsCompetency {
  label: string;
  value: number | null;
  state: "actual" | "placeholder";
}

export interface AnalyticsEvidenceItem {
  title: string;
  description: string;
}

export function buildAnalyticsCompetencies(
  insights: AnalyticsInsightsResponse | null
): AnalyticsCompetency[] {
  const source = insights?.competencies || {};
  const values = [
    ["Structure", source.structure],
    ["Clarity", source.clarity],
    ["Metrics depth", source.insight],
  ] as const;

  return values.map(([label, rawValue]) => {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      return {
        label,
        value: null,
        state: "placeholder",
      };
    }

    return {
      label,
      value: rawValue > 10 ? rawValue / 10 : rawValue,
      state: "actual",
    };
  });
}

export function buildAnalyticsEvidence({
  completedSessions,
  focusAreaLabel,
  focusAreaScore,
  focusAreaDescription,
  progressDeltaLabel,
}: {
  completedSessions: number;
  focusAreaLabel: string;
  focusAreaScore: number | null;
  focusAreaDescription: string;
  progressDeltaLabel: string;
}): AnalyticsEvidenceItem[] {
  if (completedSessions <= 0 || focusAreaScore === null) {
    return [];
  }

  return [
    {
      title: "Current bottleneck",
      description: `${focusAreaLabel} is the lowest scored dimension in the latest completed feedback. ${focusAreaDescription}`,
    },
    {
      title: "Score trend",
      description:
        progressDeltaLabel === "new" ||
        progressDeltaLabel === "Needs more interviews"
          ? "The trend will become more specific as more scored interviews are completed."
          : `Recent scored interviews changed by ${progressDeltaLabel}.`,
    },
  ];
}

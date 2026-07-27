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
  focusAreaLabel,
  focusAreaScore,
  focusAreaDescription,
  progressDeltaLabel,
}: {
  focusAreaLabel: string;
  focusAreaScore: number | null;
  focusAreaDescription: string;
  progressDeltaLabel: string;
}): AnalyticsEvidenceItem[] {
  if (focusAreaScore === null) {
    return [];
  }

  return [
    {
      title: "Latest feedback",
      description: `In the latest completed feedback, ${focusAreaLabel} was the lowest scored dimension. ${focusAreaDescription}`,
    },
    {
      title: "Recent trend",
      description: `Recent scored interviews: ${progressDeltaLabel}.`,
    },
  ];
}

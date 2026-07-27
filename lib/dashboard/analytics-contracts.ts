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
  competencySampleSizes?: Record<string, number>;
}

export interface AnalyticsCompetency {
  label: string;
  value: number | null;
  sampleSize: number;
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
  const sampleSizes = insights?.competencySampleSizes || {};
  const values = [
    ["Structure", source.structure, sampleSizes.structure],
    ["Clarity", source.clarity, sampleSizes.clarity],
    ["Metrics depth", source.insight, sampleSizes.insight],
  ] as const;

  return values.map(([label, rawValue, rawSampleSize]) => {
    const sampleSize =
      typeof rawSampleSize === "number" &&
      Number.isFinite(rawSampleSize) &&
      rawSampleSize > 0
        ? Math.floor(rawSampleSize)
        : 0;
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      return {
        label,
        value: null,
        sampleSize,
        state: "placeholder",
      };
    }

    return {
      label,
      value: rawValue > 10 ? rawValue / 10 : rawValue,
      sampleSize,
      state: "actual",
    };
  });
}

export function buildAnalyticsEvidence({
  focusAreaLabel,
  focusAreaScore,
}: {
  focusAreaLabel: string;
  focusAreaScore: number | null;
}): AnalyticsEvidenceItem[] {
  if (focusAreaScore === null) {
    return [];
  }

  return [
    {
      title: "Latest scored feedback",
      description: `${focusAreaLabel} was the lowest observed dimension at ${focusAreaScore.toFixed(1)}/10.`,
    },
  ];
}

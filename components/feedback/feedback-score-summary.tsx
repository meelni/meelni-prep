import { FeedbackScoreCard, FeedbackSectionCard } from "./feedback-surface";
import type { FeedbackScoreView } from "@meelni/core";

export function FeedbackScoreSummary({
  scores,
  historical = false,
}: {
  scores: FeedbackScoreView;
  historical?: boolean;
}) {
  const dimensions = [
    ["Structure", scores.structure],
    ["Clarity", scores.clarity],
    ["Insight", scores.insight],
    ["Communication", scores.communication],
    ["Leadership", scores.leadership],
  ] as const;

  return (
    <>
      <FeedbackScoreCard
        score={scores.overall.toFixed(1)}
        label={historical ? "Historical overall score" : "Overall score"}
        description="out of 10"
      />
      <FeedbackSectionCard
        title="PM interview dimensions"
        contentClassName="space-y-6"
      >
        {dimensions.map(([label, score]) => (
          <div key={label} className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{label}</span>
              <span className="font-semibold">{score}/10</span>
            </div>
            <div
              role="meter"
              aria-label={`${label} score`}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={score}
              className="bg-muted h-2 overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${score * 10}%` }}
              />
            </div>
          </div>
        ))}
      </FeedbackSectionCard>
    </>
  );
}

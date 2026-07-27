import { FeedbackSectionCard } from "./feedback-surface";
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
    <FeedbackSectionCard
      title={historical ? "Historical score" : "Interview score"}
      description="Observed scores from this interview, on a 10-point scale."
    >
      <div className="grid gap-7 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div className="lg:border-border lg:border-r lg:pr-7">
          <p className="text-primary font-mono text-5xl leading-none font-bold sm:text-6xl">
            {scores.overall.toFixed(1)}
          </p>
          <p className="text-foreground mt-2 text-sm font-semibold">
            {historical ? "Historical overall" : "Overall score"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">out of 10</p>
        </div>
        <div className="space-y-5">
          {dimensions.map(([label, score]) => (
            <div key={label} className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{label}</span>
                <span className="font-mono font-semibold">{score}/10</span>
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
        </div>
      </div>
    </FeedbackSectionCard>
  );
}

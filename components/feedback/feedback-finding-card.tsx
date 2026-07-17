import { Quote, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/app-surface";
import { cn } from "@/lib/utils";
import {
  getFeedbackConfidenceLabel,
  type FeedbackEvidence,
  type FeedbackV2Item,
} from "@meelni/core";

interface FeedbackFindingCardProps {
  finding: FeedbackV2Item;
  onEvidenceSelect?: (evidence: FeedbackEvidence) => void;
}

const dimensionLabels: Record<FeedbackV2Item["dimension"], string> = {
  structure: "Structure",
  clarity: "Clarity",
  insight: "Insight",
  communication: "Communication",
  leadership: "Leadership",
};

export function FeedbackFindingCard({
  finding,
  onEvidenceSelect,
}: FeedbackFindingCardProps) {
  const confidenceLabel = getFeedbackConfidenceLabel(finding.confidence);
  const confidenceTone =
    confidenceLabel === "Limited evidence" ? "warning" : "muted";

  return (
    <article className="border-border/70 min-w-0 space-y-5 border-b pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill>{dimensionLabels[finding.dimension]}</StatusPill>
        <StatusPill tone={confidenceTone}>{confidenceLabel}</StatusPill>
      </div>

      <div className="min-w-0 space-y-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Observation
        </h3>
        <p className="text-foreground leading-7 wrap-anywhere">
          {finding.observation}
        </p>
      </div>

      <div className="min-w-0 space-y-3">
        <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Quote className="h-4 w-4" aria-hidden="true" />
          Transcript evidence
        </h3>
        <div className="space-y-3">
          {finding.evidence.map((evidence) => (
            <figure
              key={`${evidence.turnRef}:${evidence.quote}`}
              className="border-primary/30 bg-muted/40 min-w-0 border-l-2 px-4 py-3"
            >
              <blockquote className="text-foreground text-sm leading-6 wrap-anywhere">
                “{evidence.quote}”
              </blockquote>
              <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  Evidence from your recorded answer
                </span>
                {onEvidenceSelect && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto min-h-8 px-0"
                    onClick={() => onEvidenceSelect(evidence)}
                  >
                    View in transcript
                  </Button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "border-info/20 bg-info/5 min-w-0 rounded-lg border p-4",
          confidenceLabel === "Limited evidence" &&
            "border-warning/20 bg-warning/5"
        )}
      >
        <h3 className="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Target className="h-4 w-4" aria-hidden="true" />
          Next action
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6 wrap-anywhere">
          {finding.nextStep}
        </p>
        {confidenceLabel === "Limited evidence" && (
          <p className="text-warning mt-3 text-xs leading-5">
            This action is based on limited evidence from this interview. Check
            it against another practice answer before treating it as a pattern.
          </p>
        )}
      </div>
    </article>
  );
}

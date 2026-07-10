"use client";

import { FeedbackSectionCard } from "@/components/feedback/feedback-surface";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Quote } from "lucide-react";
import type { FeedbackItem } from "@/lib/types/feedback";
import { isFeedbackV2Item, type FeedbackV2Item } from "@meelni/core";

interface StrengthsListProps {
  strengths: (FeedbackItem | FeedbackV2Item | string)[];
}

export function StrengthsList({ strengths }: StrengthsListProps) {
  if (strengths.length === 0) {
    return null;
  }

  return (
    <FeedbackSectionCard
      title="Key Strengths"
      description="What you did exceptionally well"
      icon={<CheckCircle2 className="h-5 w-5" />}
      tone="success"
      contentClassName="space-y-4"
    >
      {strengths.map((strength, index) => {
        // Handle both string array and object array formats
        const isString = typeof strength === "string";
        const isV2 = isFeedbackV2Item(strength);
        const text = isString
          ? strength
          : isV2
            ? strength.observation
            : strength.text;
        const dimension = isString ? null : strength.dimension;
        const evidenceQuote = isString
          ? null
          : isV2
            ? strength.evidence[0]?.quote
            : strength.evidence_quote;

        // Extract dimension label if available
        const dimensionLabel = dimension
          ? dimension.charAt(0).toUpperCase() + dimension.slice(1)
          : null;

        return (
          <div
            key={index}
            className="group border-border/50 hover:border-primary/30 space-y-3 rounded-lg border p-4 transition-all duration-300"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {dimensionLabel && (
                    <Badge
                      variant="default"
                      className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      {dimensionLabel}
                    </Badge>
                  )}
                  <h3 className="font-display text-foreground text-base font-light">
                    Strength {index + 1}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {text}
                </p>
              </div>
            </div>

            {/* Evidence quote */}
            {evidenceQuote && (
              <div className="border-primary/30 bg-muted/30 relative rounded-r-lg border-l-2 p-3 pl-4">
                <Quote className="text-primary/50 absolute top-3 -left-2 h-4 w-4" />
                <p className="text-muted-foreground text-xs leading-relaxed italic">
                  &quot;{evidenceQuote}&quot;
                </p>
              </div>
            )}
          </div>
        );
      })}
    </FeedbackSectionCard>
  );
}

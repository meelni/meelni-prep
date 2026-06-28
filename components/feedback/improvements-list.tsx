"use client";

import { FeedbackSectionCard } from "@/components/feedback/feedback-surface";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { FeedbackItem } from "@/lib/types/feedback";

interface ImprovementsListProps {
  improvements: (FeedbackItem | string)[];
}

export function ImprovementsList({ improvements }: ImprovementsListProps) {
  if (improvements.length === 0) {
    return null;
  }

  return (
    <FeedbackSectionCard
      title="Areas for Improvement"
      description="Opportunities to strengthen your performance"
      icon={<AlertCircle className="h-5 w-5" />}
      tone="warning"
      contentClassName="space-y-4"
    >
      {improvements.map((improvement, index) => {
        // Handle both string array and object array formats
        const isString = typeof improvement === "string";
        const text = isString ? improvement : improvement.text;
        const dimension = isString ? null : improvement.dimension;
        const example = isString ? null : improvement.example;

        // Extract dimension label if available
        const dimensionLabel = dimension
          ? dimension.charAt(0).toUpperCase() + dimension.slice(1)
          : null;

        return (
          <div
            key={index}
            className="group border-border/50 hover:border-chart-3/30 space-y-3 rounded-lg border p-4 transition-all duration-300"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {dimensionLabel && (
                    <Badge
                      variant="default"
                      className="border-chart-3/20 bg-chart-3/10 text-chart-3 hover:bg-chart-3/20"
                    >
                      {dimensionLabel}
                    </Badge>
                  )}
                  <h3 className="font-display text-foreground text-base font-light">
                    Area {index + 1}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {text}
                </p>
              </div>
            </div>

            {/* Example */}
            {example && (
              <div className="border-chart-3/30 bg-muted/30 relative rounded-r-lg border-l-2 p-3 pl-4">
                <div className="flex items-start gap-2">
                  <ArrowRight className="text-chart-3/70 mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="font-display text-muted-foreground/70 text-xs font-light tracking-wide uppercase">
                      Example
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {example}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </FeedbackSectionCard>
  );
}

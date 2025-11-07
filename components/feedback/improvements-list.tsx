"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { FeedbackItem } from "@/lib/types/feedback";

interface ImprovementsListProps {
  improvements: FeedbackItem[];
}

export function ImprovementsList({ improvements }: ImprovementsListProps) {
  if (improvements.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-chart-3" />
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Areas for Improvement
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Opportunities to strengthen your performance
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {improvements.map((improvement, index) => {
          // Extract dimension label (capitalize dimension)
          const dimensionLabel = improvement.dimension.charAt(0).toUpperCase() + improvement.dimension.slice(1);

          return (
            <div
              key={index}
              className="group border border-border/50 rounded-lg p-4 hover:border-chart-3/30 transition-all duration-300 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="default"
                      className="bg-chart-3/10 text-chart-3 border-chart-3/20 hover:bg-chart-3/20"
                    >
                      {dimensionLabel}
                    </Badge>
                    <h3 className="text-base font-display font-light text-foreground">
                      Area {index + 1}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {improvement.text}
                  </p>
                </div>
              </div>

              {/* Example */}
              {improvement.example && (
                <div className="relative border-l-2 border-chart-3/30 pl-4 bg-muted/30 p-3 rounded-r-lg">
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-chart-3/70 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground/70 uppercase tracking-wide font-display font-light">
                        Example
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {improvement.example}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

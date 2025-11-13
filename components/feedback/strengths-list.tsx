"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Quote } from "lucide-react";
import type { FeedbackItem } from "@/lib/types/feedback";

interface StrengthsListProps {
  strengths: (FeedbackItem | string)[];
}

export function StrengthsList({ strengths }: StrengthsListProps) {
  if (strengths.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Key Strengths
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-1">
          What you did exceptionally well
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {strengths.map((strength, index) => {
          // Handle both string array and object array formats
          const isString = typeof strength === "string";
          const text = isString ? strength : strength.text;
          const dimension = isString ? null : strength.dimension;
          const evidenceQuote = isString ? null : strength.evidence_quote;

          // Extract dimension label if available
          const dimensionLabel = dimension
            ? dimension.charAt(0).toUpperCase() + dimension.slice(1)
            : null;

          return (
            <div
              key={index}
              className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {dimensionLabel && (
                      <Badge
                        variant="default"
                        className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                      >
                        {dimensionLabel}
                      </Badge>
                    )}
                    <h3 className="text-base font-display font-light text-foreground">
                      Strength {index + 1}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {text}
                  </p>
                </div>
              </div>

              {/* Evidence quote */}
              {evidenceQuote && (
                <div className="relative border-l-2 border-primary/30 pl-4 bg-muted/30 p-3 rounded-r-lg">
                  <Quote className="w-4 h-4 text-primary/50 absolute -left-2 top-3" />
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    "{evidenceQuote}"
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

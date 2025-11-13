"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Lightbulb, ArrowRight } from "lucide-react";
import type { DrillSuggestion } from "@/lib/types/feedback";

interface DrillListProps {
  drills: (DrillSuggestion | string)[];
}

export function DrillList({ drills }: DrillListProps) {
  if (drills.length === 0) {
    return null;
  }

  const handleDrillClick = (drill: DrillSuggestion | string) => {
    const title = typeof drill === "string" ? drill : drill.title;
    // Placeholder for future drill navigation
    console.log("Starting drill:", title);
    alert(`Practice drill "${title}" is coming soon! This will navigate you to a focused practice session.`);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-primary" />
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Recommended Practice Drills
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Targeted exercises to improve your weakest areas
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {drills.map((drill, index) => {
          // Handle both string array and object array formats
          const isString = typeof drill === "string";
          const title = isString ? drill : drill.title;
          const description = isString ? null : drill.description;
          const tips = isString ? null : drill.tips;

          return (
          <div
            key={index}
            className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer"
            onClick={() => handleDrillClick(drill)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="default"
                      className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                    >
                      Drill {index + 1}
                    </Badge>
                  </div>
                  <h3 className="text-base font-display font-light text-foreground group-hover:text-primary transition-colors">
                    {title}
                  </h3>
                  {description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>

                {/* Tips */}
                {tips && tips.length > 0 && (
                  <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 uppercase tracking-wide font-display font-light">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>Tips</span>
                    </div>
                    <ul className="space-y-1">
                      {tips.map((tip, tipIndex) => (
                        <li key={tipIndex} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDrillClick(drill);
                }}
              >
                <span className="text-xs">Start</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

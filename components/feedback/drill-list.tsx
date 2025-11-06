"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Clock, ArrowRight } from "lucide-react";
import type { Drill } from "@/lib/types/feedback";

interface DrillListProps {
  drills: Drill[];
}

export function DrillList({ drills }: DrillListProps) {
  if (drills.length === 0) {
    return null;
  }

  const handleDrillClick = (drill: Drill) => {
    // Placeholder for future drill navigation
    console.log("Starting drill:", drill.title);
    alert(`Practice drill "${drill.title}" is coming soon! This will navigate you to a focused practice session.`);
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
        {drills.map((drill, index) => (
          <div
            key={index}
            className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer"
            onClick={() => handleDrillClick(drill)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="default"
                    className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                  >
                    Drill {index + 1}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{drill.duration}</span>
                  </div>
                </div>
                <h3 className="text-base font-display font-light text-foreground group-hover:text-primary transition-colors">
                  {drill.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {drill.description}
                </p>
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
        ))}
      </CardContent>
    </Card>
  );
}

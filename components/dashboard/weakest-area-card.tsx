"use client";

import { TrendingDown, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { aggregateCompetencyScores } from "@/lib/analytics/aggregations";
import type { SessionWithFeedback } from "@/lib/analytics/aggregations";

interface WeakestAreaCardProps {
  sessions: SessionWithFeedback[];
}

// Tips for improving each competency dimension
const IMPROVEMENT_TIPS: Record<string, string[]> = {
  Structure: [
    "Use frameworks like CIRCLES or RICE to organize your thoughts",
    "Always start with clarifying questions to scope the problem",
  ],
  Clarity: [
    "Practice the 'So what?' test - make your main points explicit",
    "Use concrete examples to illustrate abstract concepts",
  ],
  Insight: [
    "Look for second-order effects and unintended consequences",
    "Consider multiple stakeholder perspectives before proposing solutions",
  ],
  Communication: [
    "Use signposting ('First... Second... Finally...') to guide the interviewer",
    "Pause after key points to check for understanding",
  ],
  Leadership: [
    "Show ownership by making clear recommendations with trade-offs",
    "Demonstrate empathy when discussing team dynamics or user needs",
  ],
};

export function WeakestAreaCard({ sessions }: WeakestAreaCardProps) {
  // Calculate competency scores
  const competencyScores = aggregateCompetencyScores(sessions);

  // No data available
  if (competencyScores.length === 0) {
    return (
      <Card className="p-6 border-orange-500/30 bg-orange-500/5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-orange-500/10 p-3">
            <TrendingDown className="h-6 w-6 text-orange-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-2">
              Focus Area
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Complete at least one interview to identify areas for improvement.
            </p>
            <Link href="/setup">
              <Button size="sm">
                Start First Interview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  // Find lowest-scoring dimension
  const weakestCompetency = competencyScores.reduce((lowest, current) =>
    current.score < lowest.score ? current : lowest
  );

  const competencyName = weakestCompetency.competency;
  const score = Math.round(weakestCompetency.score);
  const tips = IMPROVEMENT_TIPS[competencyName] || [];

  // Determine if this is truly weak or just relatively weaker
  const isActuallyWeak = score < 60; // Less than 60/100 = truly needs work
  const title = isActuallyWeak ? "Priority Focus Area" : "Area to Polish";

  return (
    <Card className="p-6 border-orange-500/30 bg-orange-500/5">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-orange-500/10 p-3">
          <TrendingDown className="h-6 w-6 text-orange-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Your <span className="font-medium text-orange-600">{competencyName}</span> is
            scoring {score}/100 - focus here for fastest improvement.
          </p>

          {/* Improvement Tips */}
          <div className="space-y-2 mb-4">
            {tips.map((tip, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <p className="text-muted-foreground">{tip}</p>
              </div>
            ))}
          </div>

          {/* Practice This Button */}
          <Link href={`/setup?focus=${competencyName.toLowerCase()}`}>
            <Button size="sm" variant="outline" className="border-orange-500/50 hover:bg-orange-500/10">
              Practice This
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

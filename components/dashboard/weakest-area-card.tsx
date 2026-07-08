"use client";

import { TrendingDown, ArrowRight } from "lucide-react";
import { DashboardActionCard } from "@/components/dashboard/dashboard-surface";
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
      <DashboardActionCard
        className="border-warning/30 bg-warning/5"
        icon={<TrendingDown className="text-warning h-5 w-5" />}
        eyebrow="Focus Area"
        title="Focus Area"
        description="Complete at least one interview to identify areas for improvement."
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/new-rep">
              Start First Interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />
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
    <DashboardActionCard
      className="border-warning/30 bg-warning/5"
      icon={<TrendingDown className="text-warning h-5 w-5" />}
      eyebrow="Focus Area"
      title={title}
      description={
        <>
          Your{" "}
          <span className="text-warning font-medium">{competencyName}</span> is
          scoring {score}/100 - focus here for fastest improvement.
        </>
      }
      action={
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-warning/50 hover:bg-warning/10"
        >
          <Link
            href={`/dashboard/new-rep?focus=${competencyName.toLowerCase()}`}
          >
            Practice This
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-2">
        {tips.map((tip, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <div className="bg-warning mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
            <p className="text-muted-foreground">{tip}</p>
          </div>
        ))}
      </div>
    </DashboardActionCard>
  );
}

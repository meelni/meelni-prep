"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DashboardActionCard } from "@/components/dashboard/dashboard-surface";
import { Target, ArrowRight, TrendingUp, Flame } from "lucide-react";
import type { Session } from "@/lib/api/queries";

interface NextGoalCardProps {
  sessions: Session[];
  userSummary?: {
    summary: {
      avgScore: number;
    };
    streak: {
      streakCurrent: number;
    };
  } | null;
}

type RoundType = "product_sense" | "analytical" | "leadership" | "strategy";

interface GoalRecommendation {
  title: string;
  description: string;
  icon: React.ReactNode;
  setupParams: {
    interview_type: RoundType;
  };
}

export function NextGoalCard({ sessions, userSummary }: NextGoalCardProps) {
  const router = useRouter();

  // Analyze user's history to generate personalized recommendation
  const getNextGoal = (): GoalRecommendation => {
    const completedSessions = sessions.filter((s) => s.endedAt);
    const avgScore = userSummary?.summary?.avgScore || 0;
    const currentStreak = userSummary?.streak?.streakCurrent || 0;

    // Goal 1: Complete 7-day streak (if streak is 3-6 days)
    if (currentStreak >= 3 && currentStreak < 7) {
      return {
        title: "Complete your 7-day streak",
        description: `You're ${7 - currentStreak} day${7 - currentStreak === 1 ? "" : "s"} away from earning the Week Warrior badge! Keep the momentum going.`,
        icon: <Flame className="text-warning h-5 w-5" />,
        setupParams: {
          interview_type: getMostPracticedType(completedSessions),
        },
      };
    }

    // Goal 2: Try missing interview types (encourage exploration)
    const missingTypes = getMissingTypes(completedSessions);
    if (missingTypes.length > 0) {
      const nextType = missingTypes[0];
      return {
        title: `Try a ${formatTypeName(nextType)} interview`,
        description: `You haven't practiced ${formatTypeName(nextType)} interviews yet. Earn the Well-Rounded badge by trying all types!`,
        icon: <Target className="text-primary h-5 w-5" />,
        setupParams: {
          interview_type: nextType,
        },
      };
    }

    // Goal 3: Beat your high score
    if (avgScore > 0 && avgScore < 90) {
      const highScore = Math.max(
        ...completedSessions.map((s) =>
          s.feedback?.overallScore ? parseFloat(s.feedback.overallScore) : 0
        )
      );
      const targetScore = Math.min(100, Math.ceil(highScore / 10) * 10 + 10); // Round up to next 10
      return {
        title: "Beat your high score",
        description: `Your best score is ${highScore.toFixed(1)}/10. Let's aim for ${targetScore}/10 on your next interview!`,
        icon: <TrendingUp className="text-success h-5 w-5" />,
        setupParams: {
          interview_type: getBestPerformingType(completedSessions),
        },
      };
    }

    // Goal 4: Improve weakest type
    const weakestType = getWeakestType(completedSessions);
    if (weakestType) {
      return {
        title: `Improve your ${formatTypeName(weakestType)} skills`,
        description: `${formatTypeName(weakestType)} interviews are your opportunity area. Practice makes perfect!`,
        icon: <Target className="text-primary h-5 w-5" />,
        setupParams: {
          interview_type: weakestType,
        },
      };
    }

    // Default: Keep practicing
    return {
      title: "Keep up the great work",
      description:
        "You're doing amazing! Practice another interview to maintain your progress.",
      icon: <Target className="text-primary h-5 w-5" />,
      setupParams: {
        interview_type:
          getMostPracticedType(completedSessions) || "product_sense",
      },
    };
  };

  const goal = getNextGoal();

  const handleStartInterview = () => {
    // Navigate to the dashboard-contained launcher with pre-filled interview type.
    const params = new URLSearchParams(
      goal.setupParams as Record<string, string>
    );
    router.push(`/dashboard/new-interview?${params.toString()}`);
  };

  return (
    <DashboardActionCard
      className="lg:col-span-3"
      variant="accent"
      icon={goal.icon}
      eyebrow="Next Goal"
      title={goal.title}
      description={goal.description}
      action={
        <Button size="lg" onClick={handleStartInterview} className="group">
          Start Practice
          <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Button>
      }
    />
  );
}

// Helper functions

function getMissingTypes(sessions: Session[]): RoundType[] {
  const allTypes: RoundType[] = [
    "product_sense",
    "analytical",
    "leadership",
    "strategy",
  ];
  const practicedTypes = new Set(sessions.map((s) => s.roundType as RoundType));
  return allTypes.filter((type) => !practicedTypes.has(type));
}

function getMostPracticedType(sessions: Session[]): RoundType {
  if (sessions.length === 0) return "product_sense";

  const typeCounts: Record<string, number> = {};
  sessions.forEach((s) => {
    typeCounts[s.roundType] = (typeCounts[s.roundType] || 0) + 1;
  });

  const mostPracticed = Object.entries(typeCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];
  return (mostPracticed?.[0] as RoundType) || "product_sense";
}

function getBestPerformingType(sessions: Session[]): RoundType {
  const sessionsWithScores = sessions.filter((s) => s.feedback?.overallScore);
  if (sessionsWithScores.length === 0) return "product_sense";

  const typeScores: Record<string, number[]> = {};
  sessionsWithScores.forEach((s) => {
    const score = parseFloat(s.feedback!.overallScore!);
    if (!typeScores[s.roundType]) {
      typeScores[s.roundType] = [];
    }
    typeScores[s.roundType].push(score);
  });

  const typeAvgs = Object.entries(typeScores).map(([type, scores]) => ({
    type,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));

  const best = typeAvgs.sort((a, b) => b.avg - a.avg)[0];
  return (best?.type as RoundType) || "product_sense";
}

function getWeakestType(sessions: Session[]): RoundType | null {
  const sessionsWithScores = sessions.filter((s) => s.feedback?.overallScore);
  if (sessionsWithScores.length === 0) return null;

  const typeScores: Record<string, number[]> = {};
  sessionsWithScores.forEach((s) => {
    const score = parseFloat(s.feedback!.overallScore!);
    if (!typeScores[s.roundType]) {
      typeScores[s.roundType] = [];
    }
    typeScores[s.roundType].push(score);
  });

  // Need at least 2 types to determine weakest
  if (Object.keys(typeScores).length < 2) return null;

  const typeAvgs = Object.entries(typeScores).map(([type, scores]) => ({
    type,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));

  const weakest = typeAvgs.sort((a, b) => a.avg - b.avg)[0];
  return (weakest?.type as RoundType) || null;
}

function formatTypeName(type: RoundType): string {
  const names: Record<RoundType, string> = {
    product_sense: "Product Sense",
    analytical: "Analytical",
    leadership: "Leadership",
    strategy: "Strategy",
  };
  return names[type] || type;
}

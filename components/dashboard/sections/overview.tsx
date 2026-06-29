"use client";

import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Sparkles,
  Calendar,
  Flame,
  AlertCircle,
} from "lucide-react";
import {
  DashboardActionCard,
  DashboardLoadingState,
  DashboardSectionCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ClippedAreaChart } from "@/components/dashboard/charts/clipped-area-chart";
import { GlowingRadarChart } from "@/components/dashboard/charts/glowing-radar-chart";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { BadgeDisplay } from "@/components/dashboard/badge-display";
import { NextGoalCard } from "@/components/dashboard/next-goal-card";
import type { Session } from "@/lib/api/queries";

interface OverviewSectionProps {
  sessions: Session[];
  loadingSessions: boolean;
  totalSessions: number;
  avgScore?: number;
  totalMinutes: number;
  completionRate: number;
}

interface UserSummary {
  summary: {
    totalSessions: number;
    avgScore: number;
    totalMinutes: number;
    completionRate: number;
  };
  trends: {
    sessionsChange: number | null;
    scoreChange: number | null;
    minutesChange: number | null;
  };
  milestones: {
    fiveSessionStreak: boolean;
    perfectScore: boolean;
    improving: boolean;
    consistent: boolean;
  };
  streak: {
    streakCurrent: number;
    streakLongest: number;
    isAtRisk: boolean;
  };
  recentActivity: Array<{
    sessionId: string;
    type: string;
    score: number | null;
    timestamp: string;
  }>;
}

export const OverviewSection = memo(function OverviewSection({
  sessions,
  loadingSessions,
  totalSessions,
  avgScore,
  totalMinutes,
  completionRate,
}: OverviewSectionProps) {
  const router = useRouter();
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Fetch user summary stats with trends and milestones
  useEffect(() => {
    async function fetchUserSummary() {
      try {
        const response = await fetch("/api/stats/user-summary");
        if (!response.ok) {
          throw new Error("Failed to fetch user summary");
        }
        const data = await response.json();
        setUserSummary(data);
      } catch (error) {
        console.error("Error fetching user summary:", error);
      } finally {
        setLoadingSummary(false);
      }
    }

    fetchUserSummary();
  }, [sessions]); // Refetch when sessions change

  // Score data from user summary (real feedback scores)
  // Show last 10 sessions with scores in chronological order (oldest to newest for chart)
  const scoreData = userSummary?.recentActivity
    ? userSummary.recentActivity
        .filter((activity) => activity.score !== null) // Only sessions with feedback
        .slice(0, 10) // Take first 10 (most recent) sessions with scores
        .reverse() // Reverse to chronological order (oldest to newest) for chart
        .map((activity) => ({
          date: new Date(activity.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          score: activity.score!,
          roundType: activity.type,
        }))
    : [];

  // Competency data (real average scores from feedback)
  // Use avgScore from props, fallback to userSummary average if available
  const actualAvgScore = avgScore || userSummary?.summary?.avgScore || 0;
  const competencyData = [
    {
      competency: "Structure",
      fullName: "Structure",
      score: actualAvgScore,
      fullMark: 10,
    },
    {
      competency: "Clarity",
      fullName: "Clarity",
      score: actualAvgScore,
      fullMark: 10,
    },
    {
      competency: "Insight",
      fullName: "Insight",
      score: actualAvgScore,
      fullMark: 10,
    },
    {
      competency: "Comm",
      fullName: "Communication",
      score: actualAvgScore,
      fullMark: 10,
    },
    {
      competency: "Lead",
      fullName: "Leadership",
      score: actualAvgScore,
      fullMark: 10,
    },
  ];

  // Interview type breakdown (mock data)
  const interviewTypeBreakdown = {
    productSense: sessions.filter((s) => s.roundType === "product_sense")
      .length,
    analytical: sessions.filter((s) => s.roundType === "analytical").length,
    leadership: sessions.filter((s) => s.roundType === "leadership").length,
    strategy: sessions.filter((s) => s.roundType === "strategy").length,
  };

  // Recent activity (last 5 sessions with real scores)
  const recentActivity =
    userSummary?.recentActivity.slice(0, 5).map((activity) => {
      const session = sessions.find((s) => s.id === activity.sessionId);
      const duration = session?.endedAt
        ? Math.round(
            (new Date(session.endedAt).getTime() -
              new Date(session.startedAt).getTime()) /
              60000
          )
        : null;

      return {
        time: new Date(activity.timestamp).toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        }),
        type: activity.type.replace(/_/g, " "),
        score: activity.score !== null ? activity.score.toFixed(1) : "N/A",
        duration: duration ? `${duration} mins` : "N/A",
        status: session?.endedAt ? "completed" : "in_progress",
      };
    }) || [];

  // Empty state for new users
  const isNewUser = totalSessions === 0;

  if (loadingSummary || loadingSessions) {
    return (
      <DashboardLoadingState className="p-6" label="Loading dashboard..." />
    );
  }

  // Show empty state for new users
  if (isNewUser) {
    return (
      <div className="space-y-6 p-6">
        <div className="mx-auto max-w-2xl">
          <DashboardStateCard
            icon={<Sparkles className="h-8 w-8" />}
            title="Welcome to Meelni!"
            description="Start your first mock interview to see your performance analytics, track your progress, and get AI-powered feedback."
            action={
              <Button
                size="lg"
                onClick={() => router.push("/setup")}
                className="group w-full sm:w-auto"
              >
                Start Your First Interview
                <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            }
          >
            <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-sm">
              <span className="flex items-center gap-2">
                <span className="bg-success h-2 w-2 rounded-full" />
                Real-time AI coaching
              </span>
              <span className="flex items-center gap-2">
                <span className="bg-info h-2 w-2 rounded-full" />
                Instant feedback
              </span>
              <span className="flex items-center gap-2">
                <span className="bg-primary h-2 w-2 rounded-full" />
                Track progress
              </span>
            </div>
          </DashboardStateCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Main Dashboard Grid - Improved Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stats Cards Overview - Full Width */}
        <div className="lg:col-span-3">
          <StatsCards
            totalSessions={userSummary?.summary?.totalSessions || totalSessions}
            averageScore={userSummary?.summary?.avgScore || avgScore}
            totalMinutes={userSummary?.summary?.totalMinutes || totalMinutes}
            completionRate={
              userSummary?.summary?.completionRate || completionRate
            }
            trends={userSummary?.trends}
          />
        </div>

        {/* Charts Row */}
        <div className="lg:col-span-2">
          <ClippedAreaChart data={scoreData} />
        </div>
        <div className="lg:col-span-1">
          <GlowingRadarChart data={competencyData} />
        </div>

        {/* Recent Activity */}
        <DashboardSectionCard title="Recent Activity" className="lg:col-span-1">
          <div className="hover:[&::-webkit-scrollbar-thumb]:bg-border max-h-80 space-y-0 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div key={index} className="relative pb-4 pl-6 last:pb-0">
                  {/* Connecting line (not on last item) */}
                  {index < recentActivity.length - 1 && (
                    <div className="bg-border absolute top-2 bottom-0 left-2 w-px"></div>
                  )}

                  {/* Timeline dot */}
                  <div className="border-primary bg-background absolute top-1.5 left-0 flex h-4 w-4 items-center justify-center rounded-full border-2">
                    <div className="bg-primary h-1.5 w-1.5 rounded-full"></div>
                  </div>

                  {/* Activity content */}
                  <div className="hover:bg-muted rounded p-2 text-xs transition-colors">
                    <div className="text-muted-foreground mb-1 font-mono text-xs">
                      {activity.time}
                    </div>
                    <div className="text-foreground">
                      Completed{" "}
                      <span className="text-primary font-medium capitalize">
                        {activity.type}
                      </span>{" "}
                      interview
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Score:{" "}
                      {activity.score !== "N/A"
                        ? `${activity.score}/10`
                        : "Pending"}{" "}
                      • {activity.duration}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyStateCard
                icon={<Calendar className="h-8 w-8" />}
                title="No activity yet"
                description="Your recent interview activity will appear here once you complete your first mock interview."
                cta={{
                  label: "Start Your First Interview",
                  action: () => router.push("/setup"),
                }}
              />
            )}
          </div>
        </DashboardSectionCard>

        {/* Interview Type Breakdown */}
        <DashboardSectionCard
          title="Interview Type Breakdown"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {/* Product Sense */}
            <div className="space-y-1">
              <div className="text-foreground font-mono text-2xl font-bold">
                {interviewTypeBreakdown.productSense}
              </div>
              <div className="text-muted-foreground text-xs">Product Sense</div>
            </div>

            {/* Analytical */}
            <div className="space-y-1">
              <div className="text-foreground font-mono text-2xl font-bold">
                {interviewTypeBreakdown.analytical}
              </div>
              <div className="text-muted-foreground text-xs">Analytical</div>
            </div>

            {/* Leadership */}
            <div className="space-y-1">
              <div className="text-foreground font-mono text-2xl font-bold">
                {interviewTypeBreakdown.leadership}
              </div>
              <div className="text-muted-foreground text-xs">Leadership</div>
            </div>

            {/* Strategy */}
            <div className="space-y-1">
              <div className="text-foreground font-mono text-2xl font-bold">
                {interviewTypeBreakdown.strategy}
              </div>
              <div className="text-muted-foreground text-xs">Strategy</div>
            </div>
          </div>
        </DashboardSectionCard>

        {/* Practice Streak - MOTI-001 */}
        {userSummary?.streak && (
          <DashboardSectionCard
            title="Practice Streak"
            className="lg:col-span-1"
          >
            <div className="space-y-4">
              {/* Current Streak */}
              <div className="flex items-center gap-3">
                <Flame
                  className={`h-8 w-8 ${userSummary.streak.streakCurrent > 0 ? "text-warning" : "text-muted-foreground"}`}
                />
                <div>
                  <div className="text-foreground font-mono text-3xl font-bold">
                    {userSummary.streak.streakCurrent}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Day Streak
                  </div>
                </div>
              </div>

              {/* Longest Streak */}
              <div className="border-border border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    Longest Streak
                  </span>
                  <span className="text-foreground font-mono text-sm">
                    {userSummary.streak.streakLongest} days
                  </span>
                </div>
              </div>

              {/* At Risk Warning */}
              {userSummary.streak.isAtRisk &&
                userSummary.streak.streakCurrent >= 3 && (
                  <div className="border-border border-t pt-3">
                    <div className="bg-warning/10 border-warning/20 flex items-start gap-2 rounded-lg border p-3">
                      <AlertCircle className="text-warning mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div>
                        <p className="text-warning text-sm font-medium">
                          Keep your streak!
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Practice today to maintain your{" "}
                          {userSummary.streak.streakCurrent}-day streak.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </DashboardSectionCard>
        )}

        {/* Achievements - MOTI-003 */}
        <BadgeDisplay className="bg-card border-border lg:col-span-3" />

        {/* Next Goal - MOTI-005 */}
        <NextGoalCard sessions={sessions} userSummary={userSummary} />

        {/* Start Mock Card - Full Width */}
        <DashboardActionCard
          className="lg:col-span-3"
          icon={<Sparkles className="h-5 w-5" />}
          eyebrow="Ready to practice?"
          title="Start Your Mock Interview"
          description="Choose your interview type, difficulty, and voice settings. Practice product sense, analytical thinking, leadership, or strategy interviews with our AI coach."
          action={
            <Button
              size="lg"
              onClick={() => router.push("/setup")}
              className="group"
            >
              Start Mock Interview
              <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Button>
          }
        />
      </div>
    </div>
  );
});

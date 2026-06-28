"use client";

import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Calendar, Flame, AlertCircle } from "lucide-react";
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
    { competency: "Structure", fullName: "Structure", score: actualAvgScore, fullMark: 10 },
    { competency: "Clarity", fullName: "Clarity", score: actualAvgScore, fullMark: 10 },
    { competency: "Insight", fullName: "Insight", score: actualAvgScore, fullMark: 10 },
    { competency: "Comm", fullName: "Communication", score: actualAvgScore, fullMark: 10 },
    { competency: "Lead", fullName: "Leadership", score: actualAvgScore, fullMark: 10 },
  ];

  // Interview type breakdown (mock data)
  const interviewTypeBreakdown = {
    productSense: sessions.filter((s) => s.roundType === "product_sense").length,
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
            (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000
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
    return <DashboardLoadingState className="p-6" label="Loading dashboard..." />;
  }

  // Show empty state for new users
  if (isNewUser) {
    return (
      <div className="p-6 space-y-6">
        <div className="max-w-2xl mx-auto">
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
                <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            }
          >
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Overview</h2>
        <p className="text-muted-foreground font-sans">
          Track your progress and see how you&apos;re improving across all interview types.
        </p>
      </div>

      {/* Main Dashboard Grid - Improved Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats Cards Overview - Full Width */}
        <div className="lg:col-span-3">
          <StatsCards
            totalSessions={userSummary?.summary?.totalSessions || totalSessions}
            averageScore={userSummary?.summary?.avgScore || avgScore}
            totalMinutes={userSummary?.summary?.totalMinutes || totalMinutes}
            completionRate={userSummary?.summary?.completionRate || completionRate}
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
          <div className="space-y-0 max-h-80 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div key={index} className="relative pl-6 pb-4 last:pb-0">
                  {/* Connecting line (not on last item) */}
                  {index < recentActivity.length - 1 && (
                    <div className="absolute left-2 top-2 bottom-0 w-px bg-border"></div>
                  )}

                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-primary bg-background flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  </div>

                  {/* Activity content */}
                  <div className="text-xs hover:bg-muted p-2 rounded transition-colors">
                    <div className="text-muted-foreground font-mono text-xs mb-1">
                      {activity.time}
                    </div>
                    <div className="text-foreground">
                      Completed{" "}
                      <span className="text-primary font-medium capitalize">{activity.type}</span>{" "}
                      interview
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Score: {activity.score !== "N/A" ? `${activity.score}/10` : "Pending"} •{" "}
                      {activity.duration}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyStateCard
                icon={<Calendar className="w-8 h-8" />}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Product Sense */}
            <div className="space-y-1">
              <div className="text-2xl font-bold font-mono text-foreground">
                {interviewTypeBreakdown.productSense}
              </div>
              <div className="text-xs text-muted-foreground">Product Sense</div>
            </div>

            {/* Analytical */}
            <div className="space-y-1">
              <div className="text-2xl font-bold font-mono text-foreground">
                {interviewTypeBreakdown.analytical}
              </div>
              <div className="text-xs text-muted-foreground">Analytical</div>
            </div>

            {/* Leadership */}
            <div className="space-y-1">
              <div className="text-2xl font-bold font-mono text-foreground">
                {interviewTypeBreakdown.leadership}
              </div>
              <div className="text-xs text-muted-foreground">Leadership</div>
            </div>

            {/* Strategy */}
            <div className="space-y-1">
              <div className="text-2xl font-bold font-mono text-foreground">
                {interviewTypeBreakdown.strategy}
              </div>
              <div className="text-xs text-muted-foreground">Strategy</div>
            </div>
          </div>
        </DashboardSectionCard>

        {/* Practice Streak - MOTI-001 */}
        {userSummary?.streak && (
          <DashboardSectionCard title="Practice Streak" className="lg:col-span-1">
            <div className="space-y-4">
              {/* Current Streak */}
              <div className="flex items-center gap-3">
                <Flame className={`w-8 h-8 ${userSummary.streak.streakCurrent > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-3xl font-bold font-mono text-foreground">
                    {userSummary.streak.streakCurrent}
                  </div>
                  <div className="text-xs text-muted-foreground">Day Streak</div>
                </div>
              </div>

              {/* Longest Streak */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Longest Streak</span>
                  <span className="text-sm font-mono text-foreground">
                    {userSummary.streak.streakLongest} days
                  </span>
                </div>
              </div>

              {/* At Risk Warning */}
              {userSummary.streak.isAtRisk && userSummary.streak.streakCurrent >= 3 && (
                <div className="pt-3 border-t border-border">
                  <div className="bg-warning/10 border-warning/20 flex items-start gap-2 rounded-lg border p-3">
                    <AlertCircle className="text-warning mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="text-warning text-sm font-medium">Keep your streak!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Practice today to maintain your {userSummary.streak.streakCurrent}-day streak.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DashboardSectionCard>
        )}

        {/* Achievements - MOTI-003 */}
        <BadgeDisplay className="lg:col-span-3 bg-card border-border" />

        {/* Next Goal - MOTI-005 */}
        <NextGoalCard sessions={sessions} userSummary={userSummary} />

        {/* Start Mock Card - Full Width */}
        <DashboardActionCard
          className="lg:col-span-3"
          icon={<Sparkles className="w-5 h-5" />}
          eyebrow="Ready to practice?"
          title="Start Your Mock Interview"
          description="Choose your interview type, difficulty, and voice settings. Practice product sense, analytical thinking, leadership, or strategy interviews with our AI coach."
          action={
            <Button size="lg" onClick={() => router.push("/setup")} className="group">
              Start Mock Interview
              <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Button>
          }
        />
      </div>
    </div>
  );
});

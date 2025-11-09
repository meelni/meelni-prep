"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Calendar, Loader2 } from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ScoreChart } from "@/components/dashboard/score-chart";
import { CompetencyRadar } from "@/components/dashboard/competency-radar";
import { SessionList } from "@/components/dashboard/session-list";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { MilestoneBadges, MilestoneType } from "@/components/dashboard/stats/milestone-badge";
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
  recentActivity: Array<{
    sessionId: string;
    type: string;
    score: number | null;
    timestamp: string;
  }>;
}

export function OverviewSection({
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

  // Derive milestone badges from user summary
  const milestoneBadges: MilestoneType[] = [];
  if (userSummary?.milestones) {
    if (userSummary.milestones.fiveSessionStreak) milestoneBadges.push("streak");
    if (userSummary.milestones.perfectScore) milestoneBadges.push("perfect");
    if (userSummary.milestones.improving) milestoneBadges.push("improving");
    if (userSummary.milestones.consistent) milestoneBadges.push("consistent");
  }

  // Score data from user summary (real feedback scores)
  const scoreData =
    userSummary?.recentActivity
      .filter((activity) => activity.score !== null)
      .slice(0, 10)
      .reverse()
      .map((activity) => ({
        date: new Date(activity.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        score: activity.score!,
        roundType: activity.type,
      })) || [];

  // Competency data (real average scores from feedback)
  // TODO: Fetch detailed competency breakdown from API
  const competencyData = userSummary
    ? [
        { competency: "Structure", score: avgScore || 0, fullMark: 10 },
        { competency: "Clarity", score: avgScore || 0, fullMark: 10 },
        { competency: "Insight", score: avgScore || 0, fullMark: 10 },
        { competency: "Communication", score: avgScore || 0, fullMark: 10 },
        { competency: "Leadership", score: avgScore || 0, fullMark: 10 },
      ]
    : [];

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
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Show empty state for new users
  if (isNewUser) {
    return (
      <div className="p-6 space-y-6">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-12 text-center space-y-6">
              <div className="space-y-3">
                <Sparkles className="w-16 h-16 mx-auto text-primary" />
                <h2 className="text-3xl font-display font-light text-foreground">
                  Welcome to Meelni!
                </h2>
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  Start your first mock interview to see your performance analytics, track your
                  progress, and get AI-powered feedback.
                </p>
              </div>

              <div className="space-y-4">
                <Button
                  size="lg"
                  onClick={() => router.push("/setup")}
                  className="w-full sm:w-auto group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-display font-light shadow-md hover:shadow-lg transition-all duration-300"
                >
                  Start Your First Interview
                  <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>

                <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    Real-time AI coaching
                  </span>
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    Instant feedback
                  </span>
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    Track progress
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Main Dashboard Grid - Improved Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Milestone Badges - Full Width */}
        {milestoneBadges.length > 0 && (
          <div className="lg:col-span-3 relative z-20">
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Achievements
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Keep up the great work! You've earned {milestoneBadges.length}{" "}
                    {milestoneBadges.length === 1 ? "milestone" : "milestones"}.
                  </p>
                </div>
                <MilestoneBadges milestones={milestoneBadges} />
              </div>
            </Card>
          </div>
        )}

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

        {/* Charts Row - Only show if we have real feedback scores */}
        {scoreData.length > 0 && (
          <>
            <div className="lg:col-span-2">
              <ScoreChart data={scoreData} />
            </div>
            <div className="lg:col-span-1">
              <CompetencyRadar data={competencyData} />
            </div>
          </>
        )}

        {/* Recent Activity */}
        <Card className="lg:col-span-1 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
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
          </CardContent>
        </Card>

        {/* Interview Type Breakdown */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Interview Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
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
          </CardContent>
        </Card>

        {/* Start Mock Card - Full Width */}
        <Card className="lg:col-span-3 bg-card border-border hover:border-primary/30 transition-all duration-300">
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="text-sm font-display font-light text-primary">Ready to practice?</span>
                </div>
                <h2 className="text-2xl font-display font-light text-foreground">
                  Start Your Mock Interview
                </h2>
                <p className="text-muted-foreground font-sans max-w-2xl">
                  Choose your interview type, difficulty, and voice settings. Practice product
                  sense, analytical thinking, leadership, or strategy interviews with our AI coach.
                </p>
              </div>
              <div className="ml-6">
                <Button
                  size="lg"
                  onClick={() => router.push("/setup")}
                  className="group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-display font-light shadow-sm hover:shadow-md transition-all duration-300"
                >
                  Start Mock Interview
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

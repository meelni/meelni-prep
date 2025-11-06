"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ScoreChart } from "@/components/dashboard/score-chart";
import { CompetencyRadar } from "@/components/dashboard/competency-radar";
import { SessionList } from "@/components/dashboard/session-list";
import Link from "next/link";

interface Session {
  id: string;
  roundType: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  config?: any;
}

interface OverviewSectionProps {
  sessions: Session[];
  loadingSessions: boolean;
  totalSessions: number;
  avgScore?: number;
  totalMinutes: number;
  completionRate: number;
}

export function OverviewSection({
  sessions,
  loadingSessions,
  totalSessions,
  avgScore,
  totalMinutes,
  completionRate,
}: OverviewSectionProps) {
  // Mock score data (will be real once feedback engine is built)
  const scoreData = sessions.slice(0, 10).map((session, index) => ({
    date: new Date(session.startedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    score: 7 + Math.random() * 2, // Mock score
    roundType: session.roundType,
  }));

  // Mock competency data (will be real once feedback engine is built)
  const competencyData = [
    { competency: "Structure", score: 7.5, fullMark: 10 },
    { competency: "Clarity", score: 8.2, fullMark: 10 },
    { competency: "Insight", score: 7.8, fullMark: 10 },
    { competency: "Communication", score: 8.5, fullMark: 10 },
    { competency: "Leadership", score: 7.2, fullMark: 10 },
  ];

  // Interview type breakdown (mock data)
  const interviewTypeBreakdown = {
    productSense: sessions.filter((s) => s.roundType === "product_sense").length,
    analytical: sessions.filter((s) => s.roundType === "analytical").length,
    leadership: sessions.filter((s) => s.roundType === "leadership").length,
    strategy: sessions.filter((s) => s.roundType === "strategy").length,
  };

  // Recent activity (last 5 sessions)
  const recentActivity = sessions.slice(0, 5).map((session) => {
    const duration = session.endedAt
      ? Math.round(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000
        )
      : null;
    const mockScore = (7 + Math.random() * 2).toFixed(1);

    return {
      time: new Date(session.startedAt).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
      type: session.roundType.replace(/_/g, " "),
      score: mockScore,
      duration: duration ? `${duration} mins` : "In progress",
      status: session.endedAt ? "completed" : "in_progress",
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stats Cards Overview */}
        <div className="lg:col-span-12">
          <StatsCards
            totalSessions={totalSessions}
            averageScore={avgScore}
            totalMinutes={totalMinutes}
            completionRate={completionRate}
          />
        </div>

        {/* Recent Activity */}
        <Card className="lg:col-span-4 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    className="text-xs border-l-2 border-primary pl-3 hover:bg-muted p-2 rounded transition-colors"
                  >
                    <div className="text-muted-foreground font-mono">{activity.time}</div>
                    <div className="text-foreground">
                      Completed{" "}
                      <span className="text-primary font-medium capitalize">{activity.type}</span>{" "}
                      interview
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Score: {activity.score}/10 • {activity.duration}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-2">Start your first mock interview!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Charts Row */}
        {sessions.length > 0 && (
          <>
            <div className="lg:col-span-4">
              <ScoreChart data={scoreData} />
            </div>
            <div className="lg:col-span-4">
              <CompetencyRadar data={competencyData} />
            </div>
          </>
        )}

        {/* Interview Type Breakdown */}
        <Card className="lg:col-span-4 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Interview Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-xs text-foreground font-display font-light">Completed Interviews</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Product Sense</span>
                    <span className="text-foreground font-bold font-mono">
                      {interviewTypeBreakdown.productSense}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Analytical Thinking</span>
                    <span className="text-foreground font-bold font-mono">
                      {interviewTypeBreakdown.analytical}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Leadership & Drive</span>
                    <span className="text-foreground font-bold font-mono">
                      {interviewTypeBreakdown.leadership}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Strategy</span>
                    <span className="text-foreground font-bold font-mono">
                      {interviewTypeBreakdown.strategy}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Start Mock Card */}
        <Card className="lg:col-span-8 bg-card border-border hover:border-primary/30 transition-all duration-300">
          <CardContent className="p-8 md:p-10">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="text-sm font-display font-light text-primary">Ready to practice?</span>
                </div>
                <h2 className="text-2xl font-display font-light text-foreground">
                  Start Your Mock Interview
                </h2>
                <p className="text-muted-foreground font-sans">
                  Choose your interview type, difficulty, and voice settings. Practice product
                  sense, analytical thinking, leadership, or strategy interviews with our AI coach.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/setup" className="flex-1">
                  <Button
                    size="lg"
                    className="w-full group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-display font-light shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    Start Mock Interview
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

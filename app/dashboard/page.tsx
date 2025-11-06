"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { SessionList } from "@/components/dashboard/session-list";
import { ScoreChart } from "@/components/dashboard/score-chart";
import { CompetencyRadar } from "@/components/dashboard/competency-radar";
import { motion } from "framer-motion";
import { ArrowRight, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface Session {
  id: string;
  roundType: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  config?: any;
}

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Fetch sessions
  useEffect(() => {
    if (!user) return;

    const fetchSessions = async () => {
      try {
        setLoadingSessions(true);
        const res = await fetch("/api/sessions?limit=20");
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchSessions();
  }, [user]);

  // Redirect to signin if not authenticated
  if (!isLoading && !user) {
    router.push("/auth/signin");
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </motion.div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Get user's first name or email
  const displayName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  // Calculate stats from sessions
  const completedSessions = sessions.filter((s) => s.endedAt);
  const totalMinutes = completedSessions.reduce((sum, session) => {
    const duration = Math.round(
      (new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime()) / 60000
    );
    return sum + duration;
  }, 0);
  const completionRate = sessions.length > 0
    ? (completedSessions.length / sessions.length) * 100
    : 0;

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

  const avgScore = scoreData.length > 0
    ? scoreData.reduce((sum, d) => sum + d.score, 0) / scoreData.length
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <Icons.logo className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <span className="font-sans font-semibold text-lg text-foreground">
                Meelni
              </span>
            </Link>

            {/* Sign Out */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Welcome Section */}
          <motion.div variants={fadeInUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-primary">Welcome back!</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
              Hey {displayName} 👋
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Track your progress and keep improving your interview skills
            </p>
          </motion.div>

          {/* Stats Cards */}
          <motion.div variants={fadeInUp}>
            <StatsCards
              totalSessions={sessions.length}
              averageScore={avgScore}
              totalMinutes={totalMinutes}
              completionRate={completionRate}
            />
          </motion.div>

          {/* Charts Row */}
          {sessions.length > 0 && (
            <motion.div variants={fadeInUp} className="grid gap-6 lg:grid-cols-2">
              <ScoreChart data={scoreData} />
              <CompetencyRadar data={competencyData} />
            </motion.div>
          )}

          {/* Start Mock Card */}
          <motion.div variants={fadeInUp}>
            <Card className="p-8 md:p-10 bg-gradient-to-br from-surface/50 to-surface border-border/50 hover:border-primary/30 transition-all duration-300">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-foreground">
                    Start Your Mock Interview
                  </h2>
                  <p className="text-muted-foreground">
                    Choose your interview type, difficulty, and voice settings. Practice product sense,
                    analytical thinking, leadership, or strategy interviews with our AI coach.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/setup" className="flex-1">
                    <Button
                      size="lg"
                      className="w-full group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      Start Mock Interview
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Interview History */}
          <motion.div variants={fadeInUp} className="space-y-4">
            <h3 className="text-2xl font-semibold text-foreground">Interview History</h3>
            {loadingSessions ? (
              <Card className="p-12 bg-surface/30 border-border/30 text-center">
                <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </Card>
            ) : (
              <SessionList sessions={sessions} />
            )}
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

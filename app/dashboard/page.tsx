"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { HistorySection } from "@/components/dashboard/sections/history";
import { AnalyticsSection } from "@/components/dashboard/sections/analytics";
import { FeedbackSection } from "@/components/dashboard/sections/feedback";
import { SettingsSection } from "@/components/dashboard/sections/settings";

interface Session {
  id: string;
  roundType: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  config?: any;
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");

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
      <div className="min-h-screen bg-background flex items-center justify-center">
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

  const avgScore = scoreData.length > 0
    ? scoreData.reduce((sum, d) => sum + d.score, 0) / scoreData.length
    : undefined;

  // Render section based on activeSection
  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return (
          <OverviewSection
            sessions={sessions}
            loadingSessions={loadingSessions}
            totalSessions={sessions.length}
            avgScore={avgScore}
            totalMinutes={totalMinutes}
            completionRate={completionRate}
          />
        );
      case "history":
        return <HistorySection sessions={sessions} loadingSessions={loadingSessions} />;
      case "analytics":
        return <AnalyticsSection />;
      case "feedback":
        return <FeedbackSection />;
      case "settings":
        return <SettingsSection />;
      default:
        return (
          <OverviewSection
            sessions={sessions}
            loadingSessions={loadingSessions}
            totalSessions={sessions.length}
            avgScore={avgScore}
            totalMinutes={totalMinutes}
            completionRate={completionRate}
          />
        );
    }
  };

  return (
    <DashboardLayout
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      totalSessions={sessions.length}
      totalMinutes={totalMinutes}
      avgScore={avgScore}
    >
      {renderSection()}
    </DashboardLayout>
  );
}

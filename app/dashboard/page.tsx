"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { HistorySection } from "@/components/dashboard/sections/history";
import { AnalyticsSection } from "@/components/dashboard/sections/analytics";
import { FeedbackSection } from "@/components/dashboard/sections/feedback";
import { SettingsSection } from "@/components/dashboard/sections/settings";
import { FirstTimeUserExperience } from "@/components/dashboard/first-time-user-experience";
import { DashboardLoading } from "@/components/dashboard/loading";
import { DashboardError } from "@/components/dashboard/error";
import { useSessions } from "@/lib/api/queries";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("overview");

  // Fetch sessions using React Query
  const {
    data,
    isLoading: sessionsLoading,
    error,
    refetch,
  } = useSessions(20);

  // Redirect to signin if not authenticated
  if (!authLoading && !user) {
    router.push("/auth/signin");
    return null;
  }

  // Loading state for auth
  if (authLoading) {
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

  // Loading state for sessions
  if (sessionsLoading) {
    return <DashboardLoading />;
  }

  // Error state
  if (error) {
    return <DashboardError error={error as Error} reset={() => refetch()} />;
  }

  // Extract data from React Query response
  const sessions = data?.sessions || [];
  const stats = data?.stats || {
    totalSessions: 0,
    totalMinutes: 0,
    avgScore: 0,
    completionRate: 0,
  };

  // Check if first-time user
  const isFirstTimeUser = stats.totalSessions === 0;

  // Render section based on activeSection
  const renderSection = () => {
    // Show FTUE for first-time users on overview
    if (activeSection === "overview" && isFirstTimeUser) {
      return <FirstTimeUserExperience />;
    }

    switch (activeSection) {
      case "overview":
        return (
          <OverviewSection
            sessions={sessions}
            loadingSessions={false}
            totalSessions={stats.totalSessions}
            avgScore={stats.avgScore || undefined}
            totalMinutes={stats.totalMinutes}
            completionRate={stats.completionRate}
          />
        );
      case "history":
        return <HistorySection sessions={sessions} loadingSessions={false} />;
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
            loadingSessions={false}
            totalSessions={stats.totalSessions}
            avgScore={stats.avgScore || undefined}
            totalMinutes={stats.totalMinutes}
            completionRate={stats.completionRate}
          />
        );
    }
  };

  return (
    <DashboardLayout
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      totalSessions={stats.totalSessions}
      totalMinutes={stats.totalMinutes}
      avgScore={stats.avgScore || undefined}
    >
      {renderSection()}
    </DashboardLayout>
  );
}

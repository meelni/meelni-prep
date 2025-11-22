"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useState, useEffect, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { FirstTimeUserExperience } from "@/components/dashboard/first-time-user-experience";
import { DashboardLoading } from "@/components/dashboard/loading";
import { DashboardError } from "@/components/dashboard/error";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";

// Lazy load heavy section components for better performance
const OverviewSection = lazy(() => import("@/components/dashboard/sections/overview").then(m => ({ default: m.OverviewSection })));
const HistorySection = lazy(() => import("@/components/dashboard/sections/history").then(m => ({ default: m.HistorySection })));
const AnalyticsSection = lazy(() => import("@/components/dashboard/sections/analytics").then(m => ({ default: m.AnalyticsSection })));
const SettingsSection = lazy(() => import("@/components/dashboard/sections/settings").then(m => ({ default: m.SettingsSection })));
const QuestionsSection = lazy(() => import("@/components/dashboard/sections/questions").then(m => ({ default: m.QuestionsSection })));

// Section loading fallback component
function SectionLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading section...</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("overview");

  // Track Web Vitals performance
  useWebVitals('dashboard');

  // Check for pending redirect from OAuth (e.g., from explore page)
  useEffect(() => {
    const pendingRedirect = sessionStorage.getItem("auth_redirect_to");
    if (pendingRedirect) {
      sessionStorage.removeItem("auth_redirect_to");
      router.push(pendingRedirect);
    }
  }, [router]);

  // Track dashboard section views
  useEffect(() => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('dashboard_viewed', {
      section: activeSection,
    });
  }, [activeSection]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Fetch sessions using React Query
  const {
    data,
    isLoading: sessionsLoading,
    error,
    refetch,
  } = useSessions(20);

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
    }
  }, [authLoading, user, router]);

  // Unified loading state - use skeleton for both auth and sessions loading
  if (authLoading || sessionsLoading) {
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

  // Render section based on activeSection (wrapped in Suspense for lazy loading)
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
      case "questions":
        return <QuestionsSection />;
      case "analytics":
        return <AnalyticsSection />;
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
      key={`dashboard-${user?.id || 'guest'}`}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      totalSessions={stats.totalSessions}
      totalMinutes={stats.totalMinutes}
      avgScore={stats.avgScore || undefined}
      user={user}
      onSignOut={handleSignOut}
    >
      <Suspense key={activeSection} fallback={<SectionLoading />}>
        {renderSection()}
      </Suspense>
    </DashboardLayout>
  );
}

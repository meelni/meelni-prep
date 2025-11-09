"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { HistorySection } from "@/components/dashboard/sections/history";
import { AnalyticsSection } from "@/components/dashboard/sections/analytics";
import { SettingsSection } from "@/components/dashboard/sections/settings";
import { FirstTimeUserExperience } from "@/components/dashboard/first-time-user-experience";
import { DashboardLoading } from "@/components/dashboard/loading";
import { DashboardError } from "@/components/dashboard/error";
import { SetupModal } from "@/components/dashboard/setup-modal";
import { useSessions } from "@/lib/api/queries";
import { useSetupModal } from "@/lib/hooks/use-setup-modal";

export default function DashboardPage() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("overview");

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Setup modal hook
  const setupModal = useSetupModal();

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

  // Render section based on activeSection
  const renderSection = () => {
    // Show FTUE for first-time users on overview
    if (activeSection === "overview" && isFirstTimeUser) {
      return <FirstTimeUserExperience onStartInterview={setupModal.open} />;
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
    <>
      <DashboardLayout
        activeSection={activeSection}
        setActiveSection={handleSectionChange}
        totalSessions={stats.totalSessions}
        totalMinutes={stats.totalMinutes}
        avgScore={stats.avgScore || undefined}
        user={user}
        onSignOut={handleSignOut}
      >
        <div key={activeSection}>
          {renderSection()}
        </div>
      </DashboardLayout>

      {/* Setup Modal */}
      <SetupModal
        isOpen={setupModal.isOpen}
        onClose={setupModal.close}
        config={setupModal.config}
        updateConfig={setupModal.updateConfig}
        canProceedToNextStep={setupModal.canProceedToNextStep}
        onSubmit={setupModal.submitConfig}
        onUseSmartDefaults={setupModal.useSmartDefaults}
      />
    </>
  );
}

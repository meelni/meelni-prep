"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayout as DashboardLayoutComponent } from "@/components/dashboard/layout/dashboard-layout";
import { getDashboardActiveSectionFromPath } from "@/components/dashboard/layout/dashboard-navigation";
import { DashboardLoading } from "@/components/dashboard/loading";
import { useSessions } from "@/lib/api/queries";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      const query = searchParams.toString();
      const redirectTo = `${pathname}${query ? `?${query}` : ""}`;
      router.push(`/auth/signin?redirectTo=${encodeURIComponent(redirectTo)}`);
    }
  }, [authLoading, pathname, router, searchParams, user]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Fetch sessions using React Query
  const { data, isLoading: sessionsLoading } = useSessions(20);

  const activeSection = getDashboardActiveSectionFromPath(pathname);

  // Unified loading state
  if (authLoading || sessionsLoading) {
    return <DashboardLoading />;
  }

  // Extract data from React Query response
  const stats = data?.stats || {
    totalSessions: 0,
    totalMinutes: 0,
    avgScore: 0,
    completionRate: 0,
  };

  return (
    <DashboardLayoutComponent
      key={`dashboard-${user?.id || "guest"}`}
      activeSection={activeSection}
      totalSessions={stats.totalSessions}
      totalMinutes={stats.totalMinutes}
      avgScore={stats.avgScore || undefined}
      user={user}
      onSignOut={handleSignOut}
    >
      {children}
    </DashboardLayoutComponent>
  );
}

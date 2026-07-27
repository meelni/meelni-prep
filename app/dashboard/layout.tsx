"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayout as DashboardLayoutComponent } from "@/components/dashboard/layout/dashboard-layout";
import { getDashboardActiveSectionFromPath } from "@/components/dashboard/layout/dashboard-navigation";
import { DashboardLoading } from "@/components/dashboard/loading";

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

  const activeSection = getDashboardActiveSectionFromPath(pathname);

  if (authLoading) {
    return <DashboardLoading />;
  }

  return (
    <DashboardLayoutComponent
      key={`dashboard-${user?.id || "guest"}`}
      activeSection={activeSection}
      user={user}
      onSignOut={handleSignOut}
    >
      {children}
    </DashboardLayoutComponent>
  );
}

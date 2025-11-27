"use client";

import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";

export function DashboardLoading() {
  return (
    <DashboardLayout
      activeSection="overview"
      totalSessions={0}
      totalMinutes={0}
      avgScore={0}
    >
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card rounded-lg border border-border p-6"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>

        {/* Charts Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Score Chart Skeleton */}
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="h-5 w-48 bg-muted animate-pulse rounded mb-6" />
            <div className="h-64 bg-muted/50 animate-pulse rounded" />
          </div>

          {/* Competency Radar Skeleton */}
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="h-5 w-40 bg-muted animate-pulse rounded mb-6" />
            <div className="h-64 bg-muted/50 animate-pulse rounded" />
          </div>
        </div>

        {/* Activity Log Skeleton */}
        <div className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="h-5 w-32 bg-muted animate-pulse rounded mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-2 h-2 bg-muted animate-pulse rounded-full mt-2" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interview Type Breakdown Skeleton */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="h-5 w-56 bg-muted animate-pulse rounded mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-muted animate-pulse rounded-full" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-muted animate-pulse rounded mb-1" />
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

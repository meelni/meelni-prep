"use client";

import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-surface";
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
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <DashboardSkeletonCard key={i} variant="metric">
              <div className="mb-2 flex items-center justify-between">
                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-muted h-4 w-4 animate-pulse rounded" />
              </div>
              <div className="bg-muted mb-1 h-8 w-16 animate-pulse rounded" />
              <div className="bg-muted h-3 w-32 animate-pulse rounded" />
            </DashboardSkeletonCard>
          ))}
        </div>

        {/* Charts Section Skeleton */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Score Chart Skeleton */}
          <DashboardSkeletonCard variant="chart">
            <div className="bg-muted mb-6 h-5 w-48 animate-pulse rounded" />
            <div className="bg-muted/50 h-64 animate-pulse rounded" />
          </DashboardSkeletonCard>

          {/* Competency Radar Skeleton */}
          <DashboardSkeletonCard variant="chart">
            <div className="bg-muted mb-6 h-5 w-40 animate-pulse rounded" />
            <div className="bg-muted/50 h-64 animate-pulse rounded" />
          </DashboardSkeletonCard>
        </div>

        {/* Activity Log Skeleton */}
        <DashboardSkeletonCard className="mb-8" variant="chart">
          <div className="bg-muted mb-6 h-5 w-32 animate-pulse rounded" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="bg-muted mt-2 h-2 w-2 animate-pulse rounded-full" />
                <div className="flex-1">
                  <div className="bg-muted mb-2 h-4 w-3/4 animate-pulse rounded" />
                  <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </DashboardSkeletonCard>

        {/* Interview Type Breakdown Skeleton */}
        <DashboardSkeletonCard variant="chart">
          <div className="bg-muted mb-6 h-5 w-56 animate-pulse rounded" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="bg-muted h-12 w-12 animate-pulse rounded-full" />
                <div className="flex-1">
                  <div className="bg-muted mb-1 h-4 w-24 animate-pulse rounded" />
                  <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </DashboardSkeletonCard>
      </div>
    </DashboardLayout>
  );
}

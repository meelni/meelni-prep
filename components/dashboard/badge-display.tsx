"use client";

import { useState, useEffect } from "react";
import {
  DashboardSectionCard,
  DashboardSkeletonCard,
} from "@/components/dashboard/dashboard-surface";
import { Button } from "@/components/ui/button";
import { Award, Loader2, Lock } from "lucide-react";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned: boolean;
  earnedAt: Date | null;
}

interface BadgeDisplayProps {
  className?: string;
}

export function BadgeDisplay({ className }: BadgeDisplayProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const response = await fetch("/api/achievements");
        if (!response.ok) {
          throw new Error("Failed to fetch achievements");
        }
        const data = await response.json();
        setAchievements(data.achievements);
      } catch (error) {
        console.error("Error fetching achievements:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAchievements();
  }, []);

  // Check if badge was earned in the last 7 days
  const isRecentlyEarned = (earnedAt: Date | null): boolean => {
    if (!earnedAt) return false;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return new Date(earnedAt) > sevenDaysAgo;
  };

  if (loading) {
    return (
      <DashboardSkeletonCard className={className} variant="metric">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
        </div>
      </DashboardSkeletonCard>
    );
  }

  const earnedCount = achievements.filter((a) => a.earned).length;
  const totalCount = achievements.length;

  return (
    <DashboardSectionCard
      className={className}
      title="Achievements"
      action={
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Award className="h-3.5 w-3.5" />
          <span className="font-mono">
            {earnedCount}/{totalCount}
          </span>
        </div>
      }
    >
      {/* Badge Grid */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {achievements.map((achievement) => (
          <div key={achievement.id} className="group relative">
            {/* Badge Button */}
            <Button
              type="button"
              variant="ghost"
              aria-label={`${achievement.name}: ${achievement.description}`}
              className={`flex aspect-square w-full items-center justify-center rounded-lg border-2 text-3xl transition-all duration-300 ${
                achievement.earned
                  ? "border-primary/30 bg-primary/10 hover:bg-primary/20 hover:border-primary/50 hover:scale-105"
                  : "border-border bg-muted/30 opacity-40 grayscale hover:opacity-60"
              } `}
              title={achievement.name}
            >
              {achievement.earned ? (
                achievement.icon
              ) : (
                <Lock className="text-muted-foreground h-5 w-5" />
              )}

              {/* NEW indicator for recently earned badges */}
              {achievement.earned && isRecentlyEarned(achievement.earnedAt) && (
                <div className="bg-primary text-primary-foreground absolute -top-1 -right-1 animate-pulse rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                  NEW
                </div>
              )}
            </Button>

            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <div className="bg-popover border-border max-w-[220px] min-w-[180px] rounded-lg border p-3 shadow-lg">
                <div className="mb-1.5 flex items-start gap-2">
                  <span className="flex-shrink-0 text-2xl">
                    {achievement.earned ? (
                      achievement.icon
                    ) : (
                      <Lock className="text-muted-foreground h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm font-medium ${achievement.earned ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {achievement.name}
                    </div>
                    {achievement.earned && achievement.earnedAt && (
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        Earned{" "}
                        {new Date(achievement.earnedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {achievement.description}
                </p>
                {!achievement.earned && (
                  <div className="border-border mt-2 border-t pt-2">
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Lock className="h-3 w-3" />
                      <span>Not earned yet</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress message */}
      {earnedCount === 0 && (
        <p className="text-muted-foreground mt-4 text-center text-xs">
          Complete interviews to start earning badges!
        </p>
      )}
      {earnedCount > 0 && earnedCount < totalCount && (
        <p className="text-muted-foreground mt-4 text-center text-xs">
          {totalCount - earnedCount} more{" "}
          {totalCount - earnedCount === 1 ? "badge" : "badges"} to unlock
        </p>
      )}
      {earnedCount === totalCount && (
        <p className="text-primary mt-4 text-center text-xs font-medium">
          🎉 All badges earned!
        </p>
      )}
    </DashboardSectionCard>
  );
}

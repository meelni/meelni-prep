"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const earnedCount = achievements.filter((a) => a.earned).length;
  const totalCount = achievements.length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
            Achievements
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Award className="w-3.5 h-3.5" />
            <span className="font-mono">
              {earnedCount}/{totalCount}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Badge Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {achievements.map((achievement) => (
            <div key={achievement.id} className="group relative">
              {/* Badge Button */}
              <button
                className={`
                  w-full aspect-square rounded-lg border-2 transition-all duration-300
                  flex items-center justify-center text-3xl
                  ${
                    achievement.earned
                      ? "border-primary/30 bg-primary/10 hover:bg-primary/20 hover:border-primary/50 hover:scale-105"
                      : "border-border bg-muted/30 grayscale opacity-40 hover:opacity-60"
                  }
                `}
                title={achievement.name}
              >
                {achievement.earned ? (
                  achievement.icon
                ) : (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                )}

                {/* NEW indicator for recently earned badges */}
                {achievement.earned && isRecentlyEarned(achievement.earnedAt) && (
                  <div className="absolute -top-1 -right-1 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    NEW
                  </div>
                )}
              </button>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg min-w-[180px] max-w-[220px]">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-2xl flex-shrink-0">
                      {achievement.earned ? achievement.icon : <Lock className="w-5 h-5 text-muted-foreground" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${achievement.earned ? "text-foreground" : "text-muted-foreground"}`}>
                        {achievement.name}
                      </div>
                      {achievement.earned && achievement.earnedAt && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Earned {new Date(achievement.earnedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {achievement.description}
                  </p>
                  {!achievement.earned && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="w-3 h-3" />
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
          <p className="text-xs text-muted-foreground text-center mt-4">
            Complete interviews to start earning badges!
          </p>
        )}
        {earnedCount > 0 && earnedCount < totalCount && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            {totalCount - earnedCount} more {totalCount - earnedCount === 1 ? "badge" : "badges"} to unlock
          </p>
        )}
        {earnedCount === totalCount && (
          <p className="text-xs text-primary text-center mt-4 font-medium">
            🎉 All badges earned!
          </p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { TrendIndicator } from "./stats/trend-indicator";

interface StatsCardsProps {
  totalSessions: number;
  averageScore?: number;
  totalMinutes?: number;
  completionRate?: number;
  trends?: {
    sessionsChange: number | null;
    scoreChange: number | null;
    minutesChange: number | null;
    completionRateChange?: number | null;
  };
}

export function StatsCards({
  totalSessions,
  averageScore,
  totalMinutes,
  completionRate,
  trends,
}: StatsCardsProps) {
  const stats = [
    {
      label: "Total Sessions",
      value: totalSessions.toString(),
      trend: trends?.sessionsChange,
    },
    {
      label: "Avg Score",
      value: averageScore ? `${averageScore.toFixed(1)}/10` : "N/A",
      trend: trends?.scoreChange,
    },
    {
      label: "Total Practice",
      value: totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "0m",
      trend: trends?.minutesChange,
    },
    {
      label: "Completion Rate",
      value: completionRate ? `${Math.round(completionRate)}%` : "0%",
      trend: trends?.completionRateChange,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
        >
          <Card className="p-6 bg-surface/50 border-border/50 hover:border-primary/30 transition-all duration-300 min-h-[140px] flex flex-col justify-between">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground h-5 flex items-center">
                {stat.label}
              </p>
              <p className="text-3xl font-bold text-foreground h-10 flex items-center font-mono">
                {stat.value}
              </p>
              <div className="h-6 flex items-center">
                {stat.trend !== undefined && stat.trend !== null && (
                  <TrendIndicator
                    value={stat.trend}
                    isNew={totalSessions === 0 && index === 0}
                  />
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

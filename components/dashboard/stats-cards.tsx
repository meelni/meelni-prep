"use client";

import { motion } from "framer-motion";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-surface";
import { TrendIndicator } from "./stats/trend-indicator";
import { analytics } from "@/lib/analytics/analytics-service";

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
      value:
        averageScore !== undefined && averageScore !== null
          ? `${averageScore.toFixed(1)}/10`
          : "N/A",
      trend: trends?.scoreChange,
    },
    {
      label: "Total Practice",
      value:
        totalMinutes !== undefined && totalMinutes !== null
          ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
          : "0m",
      trend: trends?.minutesChange,
    },
    {
      label: "Completion Rate",
      value:
        completionRate !== undefined && completionRate !== null
          ? `${Math.round(completionRate)}%`
          : "0%",
      trend: trends?.completionRateChange,
    },
  ];

  const handleStatCardClick = (statLabel: string) => {
    analytics.track("chart_interacted", {
      chart_type: "stats_cards",
      interaction_type: "click",
      data_point: statLabel,
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
        >
          <DashboardMetricCard
            label={stat.label}
            value={stat.value}
            indicator={
              stat.trend !== undefined && stat.trend !== null ? (
                <TrendIndicator
                  value={stat.trend}
                  isNew={totalSessions === 0 && index === 0}
                />
              ) : null
            }
            onClick={() => handleStatCardClick(stat.label)}
          />
        </motion.div>
      ))}
    </div>
  );
}

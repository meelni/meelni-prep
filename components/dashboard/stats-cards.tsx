"use client";

import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Calendar, Clock, TrendingUp, Target } from "lucide-react";
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
      icon: Calendar,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      trend: trends?.sessionsChange,
    },
    {
      label: "Avg Score",
      value: averageScore ? `${averageScore.toFixed(1)}/10` : "N/A",
      icon: Target,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      trend: trends?.scoreChange,
    },
    {
      label: "Total Practice",
      value: totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "0m",
      icon: Clock,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      trend: trends?.minutesChange,
    },
    {
      label: "Completion Rate",
      value: completionRate ? `${Math.round(completionRate)}%` : "0%",
      icon: TrendingUp,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
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
          <Card className="p-6 bg-surface/50 border-border/50 hover:border-primary/30 transition-all duration-300">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {stat.value}
                </p>
                {stat.trend !== undefined && stat.trend !== null && (
                  <TrendIndicator
                    value={stat.trend}
                    isNew={totalSessions === 0 && index === 0}
                  />
                )}
              </div>
              <div className={`${stat.bgColor} p-2 rounded-lg`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

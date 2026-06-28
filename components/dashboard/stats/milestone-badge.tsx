"use client";

import { motion } from "framer-motion";
import { Flame, Target, TrendingUp, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type MilestoneType = "streak" | "perfect" | "improving" | "consistent";

interface Milestone {
  type: MilestoneType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  color: string;
  bgColor: string;
}

const MILESTONES: Record<MilestoneType, Milestone> = {
  streak: {
    type: "streak",
    label: "5-session streak",
    description: "Completed 5 sessions in 5 consecutive days",
    icon: Flame,
    emoji: "🔥",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  perfect: {
    type: "perfect",
    label: "Perfect score",
    description: "Achieved an overall score of 90 or higher",
    icon: Target,
    emoji: "🎯",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  improving: {
    type: "improving",
    label: "Improving",
    description: "3 consecutive sessions with increasing scores",
    icon: TrendingUp,
    emoji: "📈",
    color: "text-info",
    bgColor: "bg-info/10",
  },
  consistent: {
    type: "consistent",
    label: "Consistent",
    description: "Completed 10 or more sessions",
    icon: Star,
    emoji: "⭐",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
};

interface MilestoneBadgeProps {
  type: MilestoneType;
  showTooltip?: boolean;
  compact?: boolean;
}

export function MilestoneBadge({
  type,
  showTooltip = true,
  compact = false,
}: MilestoneBadgeProps) {
  const milestone = MILESTONES[type];
  const Icon = milestone.icon;

  return (
    <div className="group relative inline-block">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
          delay: 0.1,
        }}
        whileHover={{ scale: 1.05 }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
          "cursor-pointer transition-all duration-200",
          milestone.bgColor,
          compact ? "px-2 py-1" : "px-3 py-1.5"
        )}
      >
        {compact ? (
          <span className="text-sm">{milestone.emoji}</span>
        ) : (
          <>
            <Icon className={cn("h-3.5 w-3.5", milestone.color)} />
            <span className={cn("text-xs font-medium", milestone.color)}>
              {milestone.label}
            </span>
          </>
        )}
      </motion.div>

      {/* Tooltip on hover */}
      {showTooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="bg-card border-border min-w-[200px] rounded-lg border px-3 py-2 shadow-lg">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">{milestone.emoji}</span>
              <span className={cn("text-sm font-medium", milestone.color)}>
                {milestone.label}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {milestone.description}
            </p>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -mt-1 -translate-x-1/2">
            <div className="bg-card border-border h-2 w-2 rotate-45 border-r border-b"></div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MilestoneBadgesProps {
  milestones: MilestoneType[];
  compact?: boolean;
}

export function MilestoneBadges({
  milestones,
  compact = false,
}: MilestoneBadgesProps) {
  if (milestones.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex flex-wrap gap-2"
    >
      {milestones.map((type) => (
        <MilestoneBadge key={type} type={type} compact={compact} />
      ))}
    </motion.div>
  );
}

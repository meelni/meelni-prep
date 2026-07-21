"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Users, Lightbulb, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SelectableCard,
  SelectableCardCheck,
  SelectableCardIcon,
  SelectableCardLockOverlay,
} from "@/components/ui/selectable-card";
import {
  ROUND_TYPES,
  getRequiredTierBadge,
  type RoundType,
} from "@meelni/core";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface RoundSelectorProps {
  selected: RoundType | null;
  onSelect: (roundType: RoundType) => void;
  lockedTypes?: RoundType[];
  onLockedClick?: (roundType: RoundType) => void;
  disabled?: boolean;
}

const iconMap = {
  Users,
  Lightbulb,
  Target,
  TrendingUp,
};

export function RoundSelector({
  selected,
  onSelect,
  lockedTypes = [],
  onLockedClick,
  disabled = false,
}: RoundSelectorProps) {
  const shouldReduceMotion = useReducedMotion();

  // Get all interview types in original order
  const allRoundTypes = Object.keys(ROUND_TYPES) as RoundType[];

  // Only sort if there are locked types (free tier)
  // For Pro/Premium (no locked types), maintain original order to prevent flash
  const sortedRoundTypes =
    lockedTypes.length > 0
      ? allRoundTypes.sort((a, b) => {
          const aLocked = lockedTypes.includes(a);
          const bLocked = lockedTypes.includes(b);

          // If both locked or both unlocked, maintain original order
          if (aLocked === bLocked) return 0;

          // Unlocked types come first
          return aLocked ? 1 : -1;
        })
      : allRoundTypes;

  return (
    <motion.div
      variants={staggerContainer}
      initial={shouldReduceMotion ? false : "initial"}
      animate="animate"
      className="grid gap-3 md:grid-cols-2"
    >
      {sortedRoundTypes.map((roundType) => {
        const config = ROUND_TYPES[roundType];
        const Icon = iconMap[config.icon as keyof typeof iconMap];
        const isSelected = selected === roundType;
        const isLocked = lockedTypes.includes(roundType);
        const tierBadge = isLocked ? getRequiredTierBadge(roundType) : "";

        const handleClick = () => {
          if (disabled) return;
          if (isLocked && onLockedClick) {
            onLockedClick(roundType);
          } else if (!isLocked) {
            onSelect(roundType);
          }
        };

        return (
          <motion.div key={roundType} variants={fadeInUp} className="h-full">
            <SelectableCard
              selected={isSelected && !isLocked}
              locked={isLocked}
              disabled={disabled}
              className={
                disabled
                  ? "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground cursor-not-allowed opacity-60"
                  : isLocked
                    ? "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground"
                    : "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground hover:bg-dashboard-muted/10 hover:scale-[1.01]"
              }
              onClick={handleClick}
            >
              <div className="relative flex h-full flex-col">
                {/* Icon */}
                <SelectableCardIcon selected={isSelected}>
                  <Icon
                    className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"} `}
                  />
                </SelectableCardIcon>

                {/* Title */}
                <h3 className="text-dashboard-foreground mt-2 text-base font-semibold">
                  {config.label}
                </h3>

                {/* Subtitle */}
                <p className="text-dashboard-foreground mt-1 text-xs font-medium">
                  {config.subtitle}
                </p>

                {/* Description - fixed min-height for consistency */}
                <p className="text-dashboard-muted mt-1.5 min-h-8 flex-1 text-xs leading-relaxed">
                  {config.description}
                </p>

                {/* Lock overlay for locked types */}
                {isLocked && <SelectableCardLockOverlay />}

                {/* Pro badge for locked types */}
                {isLocked && tierBadge && (
                  <Badge
                    variant="outline"
                    className="border-primary/50 text-primary bg-primary/10 absolute top-3 right-3 font-semibold"
                  >
                    {tierBadge}
                  </Badge>
                )}

                {/* Selection indicator */}
                {isSelected && !isLocked && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-4 right-4"
                  >
                    <SelectableCardCheck />
                  </motion.div>
                )}
              </div>
            </SelectableCard>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

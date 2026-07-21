"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, BriefcaseBusiness, Compass } from "lucide-react";
import {
  SelectableCard,
  SelectableCardCheck,
  SelectableCardIcon,
} from "@/components/ui/selectable-card";
import { DIFFICULTY_LEVELS, type DifficultyLevel } from "@meelni/core";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface DifficultySelectorProps {
  selected: DifficultyLevel | null;
  onSelect: (difficulty: DifficultyLevel) => void;
}

const iconMap = {
  BookOpen,
  BriefcaseBusiness,
  Compass,
};

export function DifficultySelector({
  selected,
  onSelect,
}: DifficultySelectorProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-dashboard-foreground text-lg font-semibold">
          Difficulty Level
        </h3>
        <p className="text-dashboard-muted text-sm">
          Choose how challenging you want the interview to be
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial={shouldReduceMotion ? false : "initial"}
        animate="animate"
        className="grid gap-3 md:grid-cols-3"
      >
        {(Object.keys(DIFFICULTY_LEVELS) as DifficultyLevel[]).map(
          (difficulty) => {
            const config = DIFFICULTY_LEVELS[difficulty];
            const Icon = iconMap[config.icon as keyof typeof iconMap];
            const isSelected = selected === difficulty;

            return (
              <motion.div
                key={difficulty}
                variants={fadeInUp}
                className="h-full"
              >
                <SelectableCard
                  selected={isSelected}
                  className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground hover:bg-dashboard-muted/10 p-5 hover:scale-[1.01]"
                  onClick={() => onSelect(difficulty)}
                >
                  <div className="relative flex h-full flex-col">
                    {/* Icon and badge */}
                    <div className="flex items-center justify-between">
                      <SelectableCardIcon
                        selected={isSelected}
                        className="p-2.5"
                      >
                        <Icon
                          className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"} `}
                        />
                      </SelectableCardIcon>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        >
                          <SelectableCardCheck size="sm" />
                        </motion.div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="text-dashboard-foreground mt-3 font-semibold">
                      {config.label}
                    </h4>

                    {/* Description - fixed min-height for consistency */}
                    <p className="text-dashboard-muted mt-2 min-h-10 text-xs leading-relaxed">
                      {config.description}
                    </p>

                    {/* Subtitle */}
                    {config.subtitle && (
                      <p className="text-dashboard-muted mt-2 flex-1 text-xs leading-relaxed">
                        {config.subtitle}
                      </p>
                    )}
                  </div>
                </SelectableCard>
              </motion.div>
            );
          }
        )}
      </motion.div>
    </div>
  );
}

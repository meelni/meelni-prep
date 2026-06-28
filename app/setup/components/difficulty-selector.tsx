"use client";

import { motion } from "framer-motion";
import { Sprout, Zap, Trophy } from "lucide-react";
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
  Sprout,
  Zap,
  Trophy,
};

const difficultyTones = {
  beginner: {
    surface: "bg-success/10",
    icon: "text-success",
  },
  intermediate: {
    surface: "bg-warning/10",
    icon: "text-warning",
  },
  advanced: {
    surface: "bg-destructive/10",
    icon: "text-destructive",
  },
} as const;

export function DifficultySelector({
  selected,
  onSelect,
}: DifficultySelectorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Difficulty Level</h3>
        <p className="text-muted-foreground text-sm">
          Choose how challenging you want the interview to be
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-3 md:grid-cols-3"
      >
        {(Object.keys(DIFFICULTY_LEVELS) as DifficultyLevel[]).map(
          (difficulty) => {
            const config = DIFFICULTY_LEVELS[difficulty];
            const Icon = iconMap[config.icon as keyof typeof iconMap];
            const isSelected = selected === difficulty;
            const tone = difficultyTones[difficulty];

            return (
              <motion.div
                key={difficulty}
                variants={fadeInUp}
                className="h-full"
              >
                <SelectableCard
                  selected={isSelected}
                  className="p-5 hover:scale-[1.01]"
                  onClick={() => onSelect(difficulty)}
                >
                  {/* Semantic selection background */}
                  <div
                    className={`absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 ${tone.surface} ${isSelected ? "opacity-100" : ""} `}
                  />

                  <div className="relative flex h-full flex-col">
                    {/* Icon and badge */}
                    <div className="flex items-center justify-between">
                      <SelectableCardIcon
                        selected={isSelected}
                        className="p-2.5"
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            isSelected ? tone.icon : "text-muted-foreground"
                          } `}
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
                    <h4 className="mt-3 font-semibold">{config.label}</h4>

                    {/* Description - fixed min-height for consistency */}
                    <p className="text-muted-foreground mt-2 min-h-[2.5rem] text-xs leading-relaxed">
                      {config.description}
                    </p>

                    {/* Subtitle */}
                    {config.subtitle && (
                      <p className="text-muted-foreground/80 mt-2 flex-1 text-xs leading-relaxed">
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

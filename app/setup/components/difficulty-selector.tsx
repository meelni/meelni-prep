"use client";

import { motion } from "framer-motion";
import { Sprout, Zap, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
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

const difficultyColors = {
  beginner: "from-green-500 to-emerald-500",
  intermediate: "from-yellow-500 to-orange-500",
  advanced: "from-red-500 to-rose-500",
} as const;

export function DifficultySelector({
  selected,
  onSelect,
}: DifficultySelectorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Difficulty Level</h3>
        <p className="text-sm text-muted-foreground">
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

            return (
              <motion.div key={difficulty} variants={fadeInUp} className="h-full">
                <Card
                  className={`
                    relative cursor-pointer transition-all duration-200 p-5 h-full
                    hover:scale-[1.02]
                    ${
                      isSelected
                        ? "border-primary shadow-md ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50"
                    }
                  `}
                  onClick={() => onSelect(difficulty)}
                >
                  {/* Gradient background */}
                  <div
                    className={`
                      absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200
                      bg-gradient-to-br ${difficultyColors[difficulty]}
                      ${isSelected ? "opacity-5" : ""}
                    `}
                  />

                  <div className="relative h-full flex flex-col">
                    {/* Icon and badge */}
                    <div className="flex items-center justify-between">
                      <div
                        className={`
                          inline-flex p-2.5 rounded-lg
                          ${isSelected ? "bg-primary/10" : "bg-muted"}
                        `}
                      >
                        <Icon
                          className={`
                            w-5 h-5
                            ${
                              isSelected
                                ? "text-primary"
                                : "text-muted-foreground"
                            }
                          `}
                        />
                      </div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                        >
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="font-semibold mt-3">{config.label}</h4>

                    {/* Description - fixed min-height for consistency */}
                    <p className="text-xs text-muted-foreground leading-relaxed mt-2 min-h-[2.5rem]">
                      {config.description}
                    </p>

                    {/* Subtitle */}
                    {config.subtitle && (
                      <p className="text-xs text-muted-foreground/80 leading-relaxed mt-2 flex-1">
                        {config.subtitle}
                      </p>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          }
        )}
      </motion.div>
    </div>
  );
}

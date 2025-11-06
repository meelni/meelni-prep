"use client";

import { motion } from "framer-motion";
import { Smile, Zap, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LEVELS, DifficultyLevel } from "@/lib/interview-config";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface DifficultySelectorProps {
  selected: DifficultyLevel | null;
  onSelect: (difficulty: DifficultyLevel) => void;
}

const iconMap = {
  Smile,
  Zap,
  Award,
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
              <motion.div key={difficulty} variants={fadeInUp}>
                <Card
                  className={`
                    relative cursor-pointer transition-all duration-200 p-5
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

                  <div className="relative space-y-3">
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
                    <h4 className="font-semibold">{config.label}</h4>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {config.description}
                    </p>
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

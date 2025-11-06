"use client";

import { motion } from "framer-motion";
import { Users, Lightbulb, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ROUND_TYPES, RoundType } from "@/lib/interview-config";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface RoundSelectorProps {
  selected: RoundType | null;
  onSelect: (roundType: RoundType) => void;
}

const iconMap = {
  Users,
  Lightbulb,
  Target,
  TrendingUp,
};

export function RoundSelector({ selected, onSelect }: RoundSelectorProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid gap-4 md:grid-cols-2"
    >
      {(Object.keys(ROUND_TYPES) as RoundType[]).map((roundType) => {
        const config = ROUND_TYPES[roundType];
        const Icon = iconMap[config.icon as keyof typeof iconMap];
        const isSelected = selected === roundType;

        return (
          <motion.div key={roundType} variants={fadeInUp}>
            <Card
              className={`
                relative cursor-pointer transition-all duration-200 p-6
                hover:scale-[1.02] hover:shadow-lg
                ${
                  isSelected
                    ? "border-primary shadow-md ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                }
              `}
              onClick={() => onSelect(roundType)}
            >
              {/* Gradient background on hover/select */}
              <div
                className={`
                  absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200
                  bg-gradient-to-br ${config.color}
                  ${isSelected ? "opacity-5" : "group-hover:opacity-5"}
                `}
              />

              <div className="relative space-y-3">
                {/* Icon */}
                <div
                  className={`
                    inline-flex p-3 rounded-lg
                    ${isSelected ? "bg-primary/10" : "bg-muted"}
                    transition-colors duration-200
                  `}
                >
                  <Icon
                    className={`
                      w-6 h-6
                      ${isSelected ? "text-primary" : "text-muted-foreground"}
                    `}
                  />
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold">{config.label}</h3>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {config.description}
                </p>

                {/* Duration badge */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="text-xs text-muted-foreground">
                    ~{config.duration} min
                  </div>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                  >
                    <svg
                      className="w-4 h-4 text-white"
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
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

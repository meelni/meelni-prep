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
      className="grid gap-3 md:grid-cols-2"
    >
      {(Object.keys(ROUND_TYPES) as RoundType[]).map((roundType) => {
        const config = ROUND_TYPES[roundType];
        const Icon = iconMap[config.icon as keyof typeof iconMap];
        const isSelected = selected === roundType;

        return (
          <motion.div key={roundType} variants={fadeInUp} className="h-full">
            <Card
              className={`
                relative cursor-pointer transition-all duration-200 p-4 h-full
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

              <div className="relative h-full flex flex-col">
                {/* Icon */}
                <div
                  className={`
                    inline-flex p-2 rounded-lg w-fit
                    ${isSelected ? "bg-primary/10" : "bg-muted"}
                    transition-colors duration-200
                  `}
                >
                  <Icon
                    className={`
                      w-5 h-5
                      ${isSelected ? "text-primary" : "text-muted-foreground"}
                    `}
                  />
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold mt-2">{config.label}</h3>

                {/* Subtitle */}
                <p className="text-xs font-medium text-foreground/80 mt-1">
                  {config.subtitle}
                </p>

                {/* Description - fixed min-height for consistency */}
                <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 min-h-[2rem] flex-1">
                  {config.description}
                </p>

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

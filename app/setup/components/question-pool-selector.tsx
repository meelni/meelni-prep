"use client";

import { motion } from "framer-motion";
import { Info, Sparkles, Clock, Database } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QuestionPoolSelectorProps {
  selected: "very_recent" | "recent" | "all";
  onSelect: (value: "very_recent" | "recent" | "all") => void;
}

const POOL_OPTIONS = [
  {
    value: "very_recent" as const,
    icon: Sparkles,
    label: "Current Trends",
    description: "Questions from 2024",
    detail: "Last 365 days • Most relevant to today's product landscape",
    gradient: "from-purple-500 to-pink-500",
    iconColor: "text-purple-500",
  },
  {
    value: "recent" as const,
    icon: Clock,
    label: "Recent Pool",
    description: "Questions from 2023-2024",
    detail: "Last 730 days • Balance of relevance and variety",
    gradient: "from-blue-500 to-cyan-500",
    iconColor: "text-blue-500",
  },
  {
    value: "all" as const,
    icon: Database,
    label: "Full Archive",
    description: "All questions (2019-2024)",
    detail: "379 total questions • Includes classic frameworks",
    gradient: "from-green-500 to-emerald-500",
    iconColor: "text-green-500",
  },
];

export function QuestionPoolSelector({
  selected,
  onSelect,
}: QuestionPoolSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Question Pool</h2>
          <p className="text-muted-foreground">
            Choose which questions to practice with
          </p>
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Info className="w-5 h-5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <p className="text-sm">
                Our question bank is curated from real PM interviews at top tech
                companies. More recent questions reflect current product trends
                and interview styles.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {POOL_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selected === option.value;

          return (
            <motion.button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={
                "relative p-5 rounded-xl border-2 text-left transition-all group overflow-hidden " +
                (isSelected
                  ? "border-primary bg-primary/5 shadow-sm shadow-primary/20"
                  : "border-border hover:border-primary/50 hover:bg-muted/30")
              }
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
            >
              {/* Background gradient (subtle) */}
              <div
                className={
                  "absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity bg-gradient-to-br " +
                  option.gradient
                }
              />

              <div className="relative flex items-start gap-4">
                {/* Icon */}
                <div
                  className={
                    "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center transition-colors " +
                    (isSelected
                      ? "bg-primary/10"
                      : "bg-muted group-hover:bg-primary/5")
                  }
                >
                  <Icon
                    className={
                      "w-6 h-6 transition-colors " +
                      (isSelected ? "text-primary" : option.iconColor)
                    }
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-lg">{option.label}</div>
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
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {option.description}
                  </div>
                  <div className="text-xs text-muted-foreground/80 pt-0.5">
                    {option.detail}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

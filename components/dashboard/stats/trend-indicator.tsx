"use client";

import { ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TrendIndicatorProps {
  value: number;
  label?: string;
  isNew?: boolean;
}

export function TrendIndicator({ value, label = "vs last week", isNew = false }: TrendIndicatorProps) {
  // Determine trend direction and color
  const isPositive = value > 0;
  const isNeutral = value === 0;

  const trendColor = isPositive
    ? "text-green-500"
    : isNeutral
    ? "text-muted-foreground"
    : "text-red-500";

  const bgColor = isPositive
    ? "bg-green-500/10"
    : isNeutral
    ? "bg-muted/30"
    : "bg-red-500/10";

  // Show "New!" badge if no previous data exists
  if (isNew) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary"
      >
        <Sparkles className="w-3 h-3" />
        <span className="text-xs font-medium">New!</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full",
        bgColor
      )}
    >
      {!isNeutral && (
        <motion.div
          initial={{ y: isPositive ? 5 : -5 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {isPositive ? (
            <ArrowUp className={cn("w-3 h-3", trendColor)} />
          ) : (
            <ArrowDown className={cn("w-3 h-3", trendColor)} />
          )}
        </motion.div>
      )}
      <span className={cn("text-xs font-medium", trendColor)}>
        {isNeutral ? "—" : `${isPositive ? "+" : ""}${value.toFixed(0)}%`}
      </span>
      {label && (
        <span className="text-xs text-muted-foreground">
          {label}
        </span>
      )}
    </motion.div>
  );
}

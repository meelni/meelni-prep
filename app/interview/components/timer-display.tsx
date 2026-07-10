"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Clock } from "lucide-react";
import { motion } from "framer-motion";
import { parseInterviewDeadlineAt } from "@meelni/core";
import {
  formatInterviewTime,
  getRemainingSeconds,
} from "@/lib/interview/deadline-view";

interface TimerDisplayProps {
  deadlineAt: string;
  onDeadlineReached: () => void;
}

export function TimerDisplay({
  deadlineAt,
  onDeadlineReached,
}: TimerDisplayProps) {
  const parsedDeadline = useMemo(
    () => parseInterviewDeadlineAt(deadlineAt),
    [deadlineAt]
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(parsedDeadline, new Date())
  );
  const callbackRef = useRef(onDeadlineReached);
  const notifiedRef = useRef(false);
  callbackRef.current = onDeadlineReached;

  useEffect(() => {
    notifiedRef.current = false;
    if (!parsedDeadline) {
      console.error("Invalid interview deadline:", deadlineAt);
      setRemainingSeconds(null);
      return;
    }

    const update = () => {
      const remaining = getRemainingSeconds(parsedDeadline, new Date());
      setRemainingSeconds(remaining);
      if (remaining === 0 && !notifiedRef.current) {
        notifiedRef.current = true;
        callbackRef.current();
      }
    };

    update();
    const interval = window.setInterval(update, 250);

    return () => window.clearInterval(interval);
  }, [deadlineAt, parsedDeadline]);

  const isUrgent = remainingSeconds !== null && remainingSeconds <= 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      role="timer"
      aria-label={
        remainingSeconds === null
          ? "Interview time remaining unavailable"
          : `${formatInterviewTime(remainingSeconds)} remaining in interview`
      }
      className="bg-muted/50 border-border/50 flex items-center gap-2 rounded-lg border px-3 py-1.5"
    >
      <Clock
        className={
          isUrgent
            ? "text-warning h-3.5 w-3.5"
            : "text-muted-foreground h-3.5 w-3.5"
        }
      />
      <span
        className={
          isUrgent
            ? "text-warning font-mono text-sm"
            : "text-foreground font-mono text-sm"
        }
      >
        {remainingSeconds === null
          ? "--:--"
          : formatInterviewTime(remainingSeconds)}
      </span>
      <span className="text-muted-foreground text-sm">remaining</span>
    </motion.div>
  );
}

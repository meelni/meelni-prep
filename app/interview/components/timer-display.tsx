"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { motion } from "framer-motion";

interface TimerDisplayProps {
  startedAt: Date;
  estimatedDuration: number; // minutes
}

export function TimerDisplay({
  startedAt,
  estimatedDuration,
}: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const start = new Date(startedAt).getTime();
      setElapsed(Math.floor((now - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const estimatedSeconds = estimatedDuration * 60;
  const progress = Math.min((elapsed / estimatedSeconds) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-mono font-semibold">
            {formatTime(elapsed)}
          </span>
          <span className="text-xs text-muted-foreground">
            / {estimatedDuration} min
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

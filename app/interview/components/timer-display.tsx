"use client";

import { useEffect, useState, useMemo } from "react";
import { Clock } from "lucide-react";
import { motion } from "framer-motion";

interface TimerDisplayProps {
  startedAt: Date | string;
  estimatedDuration: number; // minutes
}

export function TimerDisplay({
  startedAt,
  estimatedDuration,
}: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  // Convert to stable timestamp - handle both Date and string safely
  const startTime = useMemo(() => {
    try {
      let timestamp;
      if (typeof startedAt === 'string') {
        timestamp = new Date(startedAt).getTime();
      } else if (startedAt instanceof Date) {
        timestamp = startedAt.getTime();
      } else {
        timestamp = Date.now();
      }

      // Validate the timestamp is a valid number
      if (isNaN(timestamp)) {
        console.error('Invalid timestamp from startedAt:', startedAt);
        return Date.now();
      }

      return timestamp;
    } catch (error) {
      console.error('Error parsing startedAt:', startedAt, error);
      return Date.now();
    }
  }, [typeof startedAt === 'string' ? startedAt : (startedAt instanceof Date ? startedAt.getTime() : Date.now())]);

  useEffect(() => {
    // Validate startTime is a valid number
    if (isNaN(startTime) || !isFinite(startTime)) {
      console.error('Invalid startTime in timer:', startTime);
      setElapsed(0);
      return;
    }

    // Calculate initial elapsed time
    const initialElapsed = Math.floor((Date.now() - startTime) / 1000);
    setElapsed(Math.max(0, initialElapsed)); // Ensure non-negative

    // Update every second
    const interval = setInterval(() => {
      const now = Date.now();
      const newElapsed = Math.floor((now - startTime) / 1000);
      setElapsed(Math.max(0, newElapsed)); // Ensure non-negative
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number): string => {
    // Handle invalid seconds
    if (isNaN(seconds) || !isFinite(seconds)) {
      return "00:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border border-border/50"
    >
      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-sm font-mono text-foreground">
        {formatTime(elapsed)}
      </span>
      <span className="text-sm text-muted-foreground">
        / {estimatedDuration} min
      </span>
    </motion.div>
  );
}

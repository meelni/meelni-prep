"use client";

import type { DashboardProgressBar } from "@/lib/dashboard/contracts";
import { cn } from "@/lib/utils";

interface ProgressSignalBarsProps {
  bars: DashboardProgressBar[];
  className?: string;
  barClassName?: string;
  showLabels?: boolean;
}

export function ProgressSignalBars({
  bars,
  className,
  barClassName,
  showLabels = false,
}: ProgressSignalBarsProps) {
  return (
    <div
      className={cn("flex items-end gap-3", className)}
      aria-label={`Observed scores from completed feedback: ${bars
        .map((bar) => `${bar.score.toFixed(1)} out of 10`)
        .join(", ")}`}
      role="img"
    >
      {bars.map((bar, index) => (
        <div
          key={`${bar.score}-${index}`}
          className="flex h-full min-h-0 flex-1 flex-col items-center gap-3"
        >
          <div className="flex min-h-0 w-full flex-1 items-end">
            <div
              data-progress-signal-bar
              className={cn("bg-primary w-full rounded-md", barClassName)}
              style={{ height: `${bar.value}%` }}
            />
          </div>
          {showLabels && (
            <span className="text-dashboard-muted text-xs">
              Interview {index + 1}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

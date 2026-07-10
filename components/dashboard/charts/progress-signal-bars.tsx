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
          className={cn(
            "flex flex-1 flex-col items-center gap-3",
            !showLabels && "h-full justify-end"
          )}
        >
          <div
            className={cn("bg-primary w-full rounded-md", barClassName)}
            style={{ height: `${bar.value}%` }}
          />
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

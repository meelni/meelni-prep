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
      aria-label="Recent progress signal"
      role="img"
    >
      {bars.map((bar, index) => (
        <div
          key={`${bar.state}-${index}`}
          className={cn(
            "flex flex-1 flex-col items-center gap-3",
            !showLabels && "h-full justify-end"
          )}
        >
          <div
            className={cn(
              "min-h-3 w-full rounded-md",
              bar.state === "actual" ? "bg-primary" : "bg-dashboard-muted/15",
              barClassName
            )}
            style={{ height: `${bar.value}%` }}
            aria-label={
              bar.state === "actual"
                ? `Interview ${index + 1}: ${Math.round(bar.value)} percent`
                : `Future progress slot ${index + 1}`
            }
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

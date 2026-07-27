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
    <div className={cn("grid grid-cols-[24px_minmax(0,1fr)] gap-2", className)}>
      <div
        className="text-dashboard-muted flex h-full flex-col justify-between pb-10 font-mono text-[10px]"
        aria-hidden="true"
      >
        <span>10</span>
        <span>5</span>
        <span>0</span>
      </div>
      <div className="relative min-h-0">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 bottom-10"
          aria-hidden="true"
        >
          <span className="border-dashboard-panel-border absolute inset-x-0 top-0 border-t" />
          <span className="border-dashboard-panel-border absolute inset-x-0 top-1/2 border-t" />
          <span className="border-dashboard-panel-border absolute inset-x-0 bottom-0 border-t" />
        </div>
        <ol
          className="relative flex h-full items-end gap-3"
          aria-label={`Observed scores from completed feedback: ${bars
            .map((bar) =>
              [
                bar.dateLabel,
                bar.roundLabel,
                `${bar.score.toFixed(1)} out of 10`,
              ]
                .filter(Boolean)
                .join(", ")
            )
            .join(", ")}`}
        >
          {bars.map((bar, index) => (
            <li
              key={`${bar.dateLabel ?? "score"}-${bar.score}-${index}`}
              data-progress-signal-item
              className="flex h-full min-h-0 flex-1 flex-col items-center gap-3"
            >
              <span className="text-dashboard-foreground font-mono text-sm font-semibold">
                {bar.score.toFixed(1)}
              </span>
              <div className="flex min-h-0 w-full flex-1 items-end">
                <div
                  data-progress-signal-bar
                  aria-hidden="true"
                  className={cn(
                    "bg-dashboard-accent mx-auto w-full max-w-16 rounded-t-md",
                    barClassName
                  )}
                  style={{ height: `${bar.value}%` }}
                />
              </div>
              {showLabels && (
                <span className="min-w-0 text-center">
                  <span className="text-dashboard-foreground block text-xs font-medium">
                    {bar.dateLabel ?? `Interview ${index + 1}`}
                  </span>
                  {bar.roundLabel && (
                    <span className="text-dashboard-muted mt-0.5 block truncate text-xs">
                      {bar.roundLabel}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

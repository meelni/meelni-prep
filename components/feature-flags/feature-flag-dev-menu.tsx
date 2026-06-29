"use client";

import { Flag, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFeatureFlags } from "@/lib/feature-flags";
import { FEATURE_FLAG_DEFINITIONS } from "@/lib/feature-flags/gates";
import type { FeatureFlagOverrideMode } from "@/lib/feature-flags/local-overrides";
import { cn } from "@/lib/utils";

interface FeatureFlagDevMenuProps {
  gateEnabled: boolean;
}

function modeLabel(mode: FeatureFlagOverrideMode) {
  if (mode === "statsig") {
    return "Statsig";
  }

  return mode === "on" ? "On" : "Off";
}

export function FeatureFlagDevMenu({ gateEnabled }: FeatureFlagDevMenuProps) {
  const {
    apiHost,
    clientAvailable,
    enabled: statsigEnabled,
    localOverrides,
    ready,
    setLocalOverride,
  } = useFeatureFlags();

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const status = !statsigEnabled
    ? "unconfigured"
    : !clientAvailable
      ? "starting"
      : ready
        ? "ready"
        : "loading";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 rounded-full px-2 text-xs"
          aria-label="Open development feature flags"
        >
          <Flag className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Flags</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              gateEnabled ? "bg-emerald-500" : "bg-muted-foreground"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 text-xs">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <div className="font-semibold text-foreground">Feature flags</div>
            <div className="text-[11px] text-muted-foreground">{status}</div>
          </div>
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              gateEnabled ? "bg-emerald-500" : "bg-muted-foreground"
            )}
            aria-label={gateEnabled ? "Gate enabled" : "Gate disabled"}
          />
        </div>

        <div className="space-y-3 p-3">
          {FEATURE_FLAG_DEFINITIONS.map((flag) => {
            const mode = localOverrides[flag.name] ?? "statsig";

            return (
              <div key={flag.name} className="space-y-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {flag.label}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {flag.name}
                  </div>
                </div>

                <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border">
                  {(["statsig", "on", "off"] satisfies FeatureFlagOverrideMode[]).map(
                    (option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={mode === option}
                        className={cn(
                          "h-7 border-r border-border px-2 text-[11px] font-medium last:border-r-0",
                          mode === option
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                        onClick={() => setLocalOverride(flag.name, option)}
                      >
                        {modeLabel(option)}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span className="truncate">API {apiHost ?? "sdk default"}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-foreground hover:text-primary"
              onClick={() => {
                for (const flag of FEATURE_FLAG_DEFINITIONS) {
                  setLocalOverride(flag.name, "statsig");
                }
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

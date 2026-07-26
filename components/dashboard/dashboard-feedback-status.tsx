import { StatusPill } from "@/components/ui/app-surface";
import type { DashboardFeedbackDisplayState } from "@/lib/dashboard/contracts";
import { cn } from "@/lib/utils";

interface DashboardFeedbackStatusProps {
  state: DashboardFeedbackDisplayState;
  label: string;
  className?: string;
}

export function DashboardFeedbackStatus({
  state,
  label,
  className,
}: DashboardFeedbackStatusProps) {
  return (
    <StatusPill
      tone={getFeedbackStateTone(state)}
      className={cn("max-w-full text-center whitespace-normal", className)}
    >
      {label}
    </StatusPill>
  );
}

function getFeedbackStateTone(
  state: DashboardFeedbackDisplayState
): "primary" | "muted" | "warning" {
  if (state === "processing") return "primary";
  if (state === "unavailable") return "warning";
  return "muted";
}

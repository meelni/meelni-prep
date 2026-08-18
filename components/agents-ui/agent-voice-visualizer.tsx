"use client";

import type { CSSProperties } from "react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { useReducedMotion } from "framer-motion";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";

import {
  AgentAudioVisualizerGrid,
  type VoiceVisualizerState,
} from "@/components/agents-ui/agent-audio-visualizer-grid";
import { cn } from "@/lib/utils";

const DEFAULT_STATUS_LABELS: Record<VoiceVisualizerState, string> = {
  connecting: "Connecting to interviewer",
  listening: "Listening",
  thinking: "Interviewer thinking",
  speaking: "Interviewer speaking",
};

interface AgentVoiceVisualizerProps {
  state: VoiceVisualizerState;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  volumeBands?: number[];
  activityLevel?: number;
  statusLabel?: string;
  appearance?: "default" | "inverse";
  showStatus?: boolean;
  decorative?: boolean;
  className?: string;
  gridClassName?: string;
}

export function AgentVoiceVisualizer({
  state,
  audioTrack,
  volumeBands,
  activityLevel = 0,
  statusLabel,
  appearance = "default",
  showStatus = true,
  decorative = false,
  className,
  gridClassName,
}: AgentVoiceVisualizerProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const intensity = Math.max(0, Math.min(1, activityLevel));
  const label = statusLabel ?? DEFAULT_STATUS_LABELS[state];

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-5",
        className
      )}
      aria-hidden={decorative || undefined}
    >
      <div
        className="flex min-h-0 flex-1 items-center justify-center transition-transform duration-150 motion-reduce:transform-none motion-reduce:transition-none"
        style={
          {
            "--voice-activity-scale": 1 + intensity * 0.04,
            transform: shouldReduceMotion
              ? undefined
              : "scale(var(--voice-activity-scale))",
          } as CSSProperties
        }
      >
        <AgentAudioVisualizerGrid
          state={state}
          audioTrack={audioTrack}
          volumeBands={volumeBands}
          size="xl"
          rowCount={7}
          columnCount={7}
          interval={state === "connecting" ? 90 : 130}
          className={cn(
            "transition-colors duration-200 motion-reduce:transition-none",
            state === "connecting" &&
              (appearance === "inverse"
                ? "text-primary-foreground/50"
                : "text-muted-foreground/60"),
            state === "listening" && "text-info",
            state === "thinking" && "text-primary",
            state === "speaking" && "text-success",
            gridClassName
          )}
        />
      </div>

      {showStatus && !decorative && (
        <div
          className={cn(
            "flex min-h-6 items-center justify-center gap-2 text-sm font-medium",
            appearance === "inverse"
              ? "text-primary-foreground/75"
              : "text-muted-foreground"
          )}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "connecting" && "bg-muted-foreground/50",
              state === "listening" && "bg-info",
              state === "thinking" && "bg-primary",
              state === "speaking" && "bg-success"
            )}
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

export function AgentVoiceVisualizerMark({
  className,
}: {
  className?: string;
}) {
  return (
    <AgentVoiceVisualizer
      state="speaking"
      volumeBands={[0.2, 0.45, 0.72, 0.95, 0.72, 0.45, 0.2]}
      showStatus={false}
      decorative
      className={className}
    />
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { useInView, useReducedMotion } from "framer-motion";
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

const LANDING_VOICE_MARK_BAND_COUNT = 7;
const LANDING_VOICE_MARK_STEP_COUNT = 32;
const LANDING_VOICE_MARK_INTERVAL_MS = 100;

export function createLandingVoiceMarkBands(progress: number) {
  const wrappedProgress = ((progress % 1) + 1) % 1;
  const phase = wrappedProgress * Math.PI * 2;
  const centerIndex = (LANDING_VOICE_MARK_BAND_COUNT - 1) / 2;

  return Array.from({ length: LANDING_VOICE_MARK_BAND_COUNT }, (_, index) => {
    const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex;
    const restingLevel = 0.77 - distanceFromCenter * 0.42;
    const breath = 0.13 * Math.sin(phase - distanceFromCenter * 0.55);
    const voiceTexture = 0.025 * Math.sin(phase * 2 + distanceFromCenter * 0.3);

    return Math.max(0.2, Math.min(0.95, restingLevel + breath + voiceTexture));
  });
}

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
        className="flex min-h-0 flex-1 [transform:scale(var(--voice-activity-scale))] items-center justify-center transition-transform duration-150 motion-reduce:transform-none motion-reduce:transition-none"
        style={
          {
            "--voice-activity-scale": 1 + intensity * 0.04,
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
  const markRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const isInView = useInView(markRef, { amount: 0.25 });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion || !isInView) return;

    const frameInterval = window.setInterval(() => {
      setStep(
        (currentStep) => (currentStep + 1) % LANDING_VOICE_MARK_STEP_COUNT
      );
    }, LANDING_VOICE_MARK_INTERVAL_MS);

    return () => window.clearInterval(frameInterval);
  }, [isInView, shouldReduceMotion]);

  const volumeBands = createLandingVoiceMarkBands(
    shouldReduceMotion ? 0 : step / LANDING_VOICE_MARK_STEP_COUNT
  );

  return (
    <div ref={markRef} className={className} aria-hidden="true">
      <AgentVoiceVisualizer
        state="speaking"
        volumeBands={volumeBands}
        showStatus={false}
        decorative
        className="h-full w-full"
      />
    </div>
  );
}

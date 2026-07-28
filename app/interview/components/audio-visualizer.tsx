"use client";

import { useEffect, useRef, useState } from "react";
import {
  useLocalParticipant,
  useTrackVolume,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Orb, type AgentState as OrbAgentState } from "@/components/ui/orb";
import { MEELNI_ORB_COLORS } from "@/lib/design-tokens";
import { mapTrackVolumeToVisualIntensity } from "./audio-level";

type AgentState = "idle" | "listening" | "thinking" | "speaking";

interface AudioVisualizerProps {
  agentState: AgentState;
}

export function AudioVisualizer({ agentState }: AudioVisualizerProps) {
  const { localParticipant } = useLocalParticipant();
  const { audioTrack: agentAudioTrack } = useVoiceAssistant();

  const [debouncedAgentState, setDebouncedAgentState] =
    useState<AgentState>("idle");
  const stateChangeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSpeakingTimeRef = useRef<number>(0);

  const userAudioTrack = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;

  const userVolume = useTrackVolume(
    userAudioTrack as Parameters<typeof useTrackVolume>[0]
  );
  const agentVolume = useTrackVolume(agentAudioTrack);

  const userVisualIntensity = mapTrackVolumeToVisualIntensity(userVolume);
  const agentVisualIntensity = mapTrackVolumeToVisualIntensity(agentVolume);
  const hasUserAudio = userVisualIntensity > 0;
  const hasAgentAudio = agentVisualIntensity > 0;

  useEffect(() => {
    const GRACE_PERIOD_MS = 700;
    const currentState =
      agentState === "idle" && hasAgentAudio ? "speaking" : agentState;

    if (currentState === "speaking") {
      lastSpeakingTimeRef.current = Date.now();

      if (debouncedAgentState !== "speaking") {
        setDebouncedAgentState("speaking");
      }

      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    } else if (debouncedAgentState === "speaking") {
      const timeSinceLastSpeaking = Date.now() - lastSpeakingTimeRef.current;

      if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
        if (!stateChangeTimerRef.current) {
          stateChangeTimerRef.current = setTimeout(() => {
            setDebouncedAgentState(currentState);
            stateChangeTimerRef.current = undefined;
          }, GRACE_PERIOD_MS - timeSinceLastSpeaking);
        }
      } else {
        setDebouncedAgentState(currentState);
      }
    } else {
      setDebouncedAgentState(currentState);

      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    }

    return () => {
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    };
  }, [agentState, debouncedAgentState, hasAgentAudio]);

  const [isUserSpeakingDebounced, setIsUserSpeakingDebounced] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    const isSpeaking =
      userAudioTrack && userAudioTrack.isMuted === false && hasUserAudio;

    if (isSpeaking) {
      if (!isUserSpeakingDebounced) {
        setIsUserSpeakingDebounced(true);
      }
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    } else if (isUserSpeakingDebounced) {
      speakingTimeoutRef.current = setTimeout(() => {
        setIsUserSpeakingDebounced(false);
      }, 500);
    }

    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = undefined;
      }
    };
  }, [hasUserAudio, isUserSpeakingDebounced, userAudioTrack]);

  const displayAgentState = debouncedAgentState;
  const orbAgentState: OrbAgentState =
    displayAgentState === "thinking"
      ? "thinking"
      : displayAgentState === "listening"
        ? "listening"
        : displayAgentState === "speaking"
          ? "talking"
          : null;

  const statusLabel = getStatusLabel(
    displayAgentState,
    isUserSpeakingDebounced
  );
  const isActive =
    displayAgentState === "speaking" ||
    displayAgentState === "thinking" ||
    isUserSpeakingDebounced;

  return (
    <div className="interview-container flex h-full w-full flex-col items-center justify-center gap-3">
      <div className="relative aspect-square min-h-0 w-full max-w-[300px] flex-1">
        <Orb
          colors={MEELNI_ORB_COLORS}
          agentState={orbAgentState}
          volumeMode="manual"
          getInputVolume={() => userVisualIntensity}
          getOutputVolume={() => agentVisualIntensity}
          className="h-full w-full"
        />
      </div>

      <div
        className="text-muted-foreground flex h-6 items-center justify-center gap-2 text-sm"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className={
            isActive
              ? "bg-primary h-1.5 w-1.5 rounded-full"
              : "bg-muted-foreground/40 h-1.5 w-1.5 rounded-full"
          }
          aria-hidden="true"
        />
        <span>{statusLabel}</span>
      </div>
    </div>
  );
}

function getStatusLabel(agentState: AgentState, isUserSpeaking: boolean) {
  if (agentState === "speaking") return "Interviewer speaking";
  if (agentState === "thinking") return "Interviewer thinking";
  if (isUserSpeaking) return "Listening";
  if (agentState === "listening") return "Your turn";
  return "Ready";
}

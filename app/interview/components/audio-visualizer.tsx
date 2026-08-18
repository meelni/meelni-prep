"use client";

import { useEffect, useRef, useState } from "react";
import {
  useLocalParticipant,
  useTrackVolume,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { AgentVoiceVisualizer } from "@/components/agents-ui/agent-voice-visualizer";
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
  const visualizerState =
    displayAgentState === "idle" ? "connecting" : displayAgentState;

  const statusLabel = getStatusLabel(
    displayAgentState,
    isUserSpeakingDebounced
  );

  return (
    <AgentVoiceVisualizer
      state={visualizerState}
      audioTrack={agentAudioTrack}
      activityLevel={
        displayAgentState === "speaking"
          ? agentVisualIntensity
          : userVisualIntensity
      }
      statusLabel={statusLabel}
    />
  );
}

function getStatusLabel(agentState: AgentState, isUserSpeaking: boolean) {
  if (agentState === "speaking") return "Interviewer speaking";
  if (agentState === "thinking") return "Interviewer thinking";
  if (isUserSpeaking) return "Listening";
  if (agentState === "listening") return "Your turn";
  return "Connecting to interviewer";
}

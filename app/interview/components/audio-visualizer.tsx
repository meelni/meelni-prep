"use client";

import { useRef, useEffect, useState } from "react";
import {
  useLocalParticipant,
  useRemoteParticipants,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "framer-motion";
import { Orb, AgentState as OrbAgentState } from "@/components/ui/orb";
import { useTrackVolume } from "@livekit/components-react";

export function AudioVisualizer() {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { state: agentStateFromHook, audioTrack: agentAudioTrackFromHook } = useVoiceAssistant();

  // Debounced agent state to prevent flickering during speech pauses
  const [debouncedAgentState, setDebouncedAgentState] = useState<string>("idle");
  const stateChangeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSpeakingTimeRef = useRef<number>(0);

  const userAudioTrack = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;

  const agentParticipant = remoteParticipants[0];
  const agentAudioTrack = agentParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;

  // Get audio volumes for reactivity
  const userVolume = useTrackVolume(userAudioTrack as any);
  const agentVolume = useTrackVolume(agentAudioTrack as any);

  // Normalize volumes to 0-1 range (same as demo)
  const normalizedUserVolume = Math.min(userVolume, 100) / 100;
  const normalizedAgentVolume = Math.min(agentVolume, 100) / 100;

  // Hybrid approach: Use hook state if available, fall back to volume detection
  // This handles both voice assistant mode and explicit agent dispatch
  useEffect(() => {
    const GRACE_PERIOD_MS = 700; // 700ms grace period for natural pauses

    // Try to use voice assistant state if available
    let currentState = (agentStateFromHook as string) || "idle";

    // If hook state is stuck on "idle" but we have agent volume, infer from audio
    // This happens when agent is explicitly dispatched (not voice assistant mode)
    if (currentState === "idle" && agentParticipant) {
      if (normalizedAgentVolume > 0.15) {
        currentState = "speaking";
      } else if (normalizedUserVolume > 0.3) {
        currentState = "listening";
      }
    }

    console.log('[AudioVisualizer] Current state:', currentState, 'Hook state:', agentStateFromHook, 'Agent vol:', normalizedAgentVolume.toFixed(2));

    // If agent is speaking, update timestamp
    if (currentState === "speaking") {
      lastSpeakingTimeRef.current = Date.now();

      // Immediately show speaking state
      if (debouncedAgentState !== "speaking") {
        setDebouncedAgentState("speaking");
      }

      // Clear any pending state change
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    } else if (currentState !== "speaking" && debouncedAgentState === "speaking") {
      // Agent stopped speaking - check if we should wait before transitioning
      const timeSinceLastSpeaking = Date.now() - lastSpeakingTimeRef.current;

      if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
        // Within grace period - delay the state change
        if (!stateChangeTimerRef.current) {
          stateChangeTimerRef.current = setTimeout(() => {
            setDebouncedAgentState(currentState);
            stateChangeTimerRef.current = undefined;
          }, GRACE_PERIOD_MS - timeSinceLastSpeaking);
        }
      } else {
        // Grace period passed - update immediately
        setDebouncedAgentState(currentState);
      }
    } else if (currentState !== "speaking") {
      // Non-speaking states (thinking, listening, idle) - update immediately
      setDebouncedAgentState(currentState);

      // Clear any pending timer
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    }

    return () => {
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
      }
    };
  }, [agentStateFromHook, debouncedAgentState, agentParticipant, normalizedAgentVolume, normalizedUserVolume]);

  // Debounced user speaking state
  const [isUserSpeakingDebounced, setIsUserSpeakingDebounced] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Higher threshold (0.3) to reduce false positives from background noise
    const isSpeaking = userAudioTrack && userAudioTrack.isMuted === false && normalizedUserVolume > 0.3;

    if (isSpeaking) {
      // Immediately show "Your Turn" when speaking detected
      if (!isUserSpeakingDebounced) {
        setIsUserSpeakingDebounced(true);
      }
      // Clear any pending timeout
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    } else if (isUserSpeakingDebounced) {
      // Delay hiding "Your Turn" by 500ms to prevent flickering
      speakingTimeoutRef.current = setTimeout(() => {
        setIsUserSpeakingDebounced(false);
      }, 500);
    }

    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [normalizedUserVolume, userAudioTrack, isUserSpeakingDebounced]);

  // Map LiveKit agent state to Orb agent state
  // Use debounced state for UI display to prevent flickering
  const displayAgentState = debouncedAgentState;

  const orbAgentState: OrbAgentState =
    displayAgentState === "thinking" ? "thinking" :
    displayAgentState === "listening" ? "listening" :
    displayAgentState === "speaking" ? "talking" :
    null;

  // Use debounced states for UI
  const isUserSpeaking = isUserSpeakingDebounced;
  const isAgentActive = displayAgentState === "speaking" || displayAgentState === "thinking";

  // Meelni purple-blue colors (hex format for THREE.js compatibility)
  const meelniColors: [string, string] = ["#a855f7", "#7c3aed"];

  // Only pass volume to Orb when actually speaking (above threshold) to prevent flickering
  const displayUserVolume = normalizedUserVolume > 0.3 ? normalizedUserVolume : 0;
  const displayAgentVolume = normalizedAgentVolume > 0.15 ? normalizedAgentVolume : 0;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-8 p-6 interview-container">
      {/* Large Orb with Audio Reactivity */}
      <div className="relative w-full max-w-md aspect-square">
        <Orb
          colors={meelniColors}
          agentState={orbAgentState}
          volumeMode="manual"
          getInputVolume={() => displayUserVolume}
          getOutputVolume={() => displayAgentVolume}
          className="w-full h-full"
        />
      </div>

      {/* Turn Indicator - Agent Active States */}
      {isAgentActive && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="relative text-center space-y-2 px-6 py-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 backdrop-blur-sm shadow-lg"
        >
          <p className="text-2xl font-sans font-medium text-primary">
            {displayAgentState === "thinking" ? "Meelni is thinking..." : "Meelni is speaking"}
          </p>
          <p className="text-sm font-sans text-muted-foreground">
            {displayAgentState === "thinking" ? "Preparing response" : "Listen carefully"}
          </p>
        </motion.div>
      )}

      {/* Turn Indicator - User's Turn */}
      {isUserSpeaking && !isAgentActive && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="relative text-center space-y-2 px-6 py-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 backdrop-blur-sm shadow-lg"
        >
          <div className="flex items-center justify-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="text-2xl font-sans font-medium text-primary">Your Turn</p>
          </div>
          <p className="text-sm font-sans text-muted-foreground">Meelni is listening</p>
        </motion.div>
      )}

      {/* Ready state message */}
      {!isAgentActive && !isUserSpeaking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-2"
        >
          <p className="text-lg font-display font-medium text-foreground">Ready to begin</p>
          <p className="text-sm font-sans text-muted-foreground">Start speaking to continue the interview</p>
        </motion.div>
      )}
    </div>
  );
}

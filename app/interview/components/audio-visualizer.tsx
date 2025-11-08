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
  const { state: agentStateFromHook } = useVoiceAssistant();

  // Track agent connection state
  const [agentConnected, setAgentConnected] = useState(false);

  // Debounced agent state to prevent flickering during speech pauses
  const [debouncedAgentState, setDebouncedAgentState] = useState<string>("idle");
  const agentStateTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastAgentSpeakingTimeRef = useRef<number>(0);

  // Raw state detection with its own debouncing
  const rawStateDetectionTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

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

  // Normalize volumes to 0-1 range
  const normalizedUserVolume = Math.min(userVolume / 0.5, 1);
  const normalizedAgentVolume = Math.min(agentVolume / 0.5, 1);

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

  // Detect agent connection
  useEffect(() => {
    const agentParticipant = remoteParticipants[0];

    if (agentParticipant && !agentConnected) {
      console.log('[AudioVisualizer] Agent connected:', agentParticipant.identity);
      setAgentConnected(true);
    }
  }, [remoteParticipants, agentConnected]);

  // Detect and debounce agent state based on audio activity
  useEffect(() => {
    if (!agentConnected) return;

    const GRACE_PERIOD_MS = 700; // 700ms grace period for natural pauses in speech

    // Determine desired state based on audio activity
    let rawState = "idle";

    if (normalizedAgentVolume > 0.15) {
      // Agent is speaking (higher volume detected)
      rawState = "speaking";
    } else if (normalizedUserVolume > 0.3) {
      // User is speaking, agent should be listening
      rawState = "listening";
    }

    // Immediate update when agent starts speaking
    if (rawState === "speaking") {
      lastAgentSpeakingTimeRef.current = Date.now();

      if (debouncedAgentState !== "speaking") {
        console.log('[AudioVisualizer] Agent started speaking');
        setDebouncedAgentState("speaking");
      }

      // Clear any pending state change
      if (agentStateTimerRef.current) {
        clearTimeout(agentStateTimerRef.current);
        agentStateTimerRef.current = undefined;
      }
    }
    // Apply grace period when stopping speaking
    else if (rawState !== "speaking" && debouncedAgentState === "speaking") {
      const timeSinceLastSpeaking = Date.now() - lastAgentSpeakingTimeRef.current;

      if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
        // Within grace period - delay the state change (only set timer once)
        if (!agentStateTimerRef.current) {
          const remainingTime = GRACE_PERIOD_MS - timeSinceLastSpeaking;
          agentStateTimerRef.current = setTimeout(() => {
            console.log('[AudioVisualizer] Grace period expired, changing state from speaking to', rawState);
            setDebouncedAgentState(rawState);
            agentStateTimerRef.current = undefined;
          }, remainingTime);
        }
      } else {
        // Grace period already passed - update immediately
        setDebouncedAgentState(rawState);
      }
    }
    // For other state transitions (listening/idle), update immediately
    else if (rawState !== debouncedAgentState) {
      console.log('[AudioVisualizer] State change:', debouncedAgentState, '→', rawState);
      setDebouncedAgentState(rawState);

      // Clear any pending timer
      if (agentStateTimerRef.current) {
        clearTimeout(agentStateTimerRef.current);
        agentStateTimerRef.current = undefined;
      }
    }

    return () => {
      if (agentStateTimerRef.current) {
        clearTimeout(agentStateTimerRef.current);
      }
    };
  }, [normalizedUserVolume, normalizedAgentVolume, agentConnected, debouncedAgentState]);

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

  // Meelni purple-blue colors
  const meelniColors: [string, string] = ["oklch(0.70 0.22 285)", "oklch(0.55 0.22 285)"];

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
          className="relative text-center space-y-2 px-6 py-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 backdrop-blur-sm shadow-lg"
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
          className="relative text-center space-y-2 px-6 py-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 backdrop-blur-sm shadow-lg"
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
          <p className="text-lg font-display font-medium text-foreground/80">Ready to begin</p>
          <p className="text-sm font-sans text-muted-foreground">Start speaking to continue the interview</p>
        </motion.div>
      )}
    </div>
  );
}

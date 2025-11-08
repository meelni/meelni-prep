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
  const [agentState, setAgentState] = useState<string>("idle");

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
  const speakingTimeoutRef = useRef<NodeJS.Timeout>();

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

  // Detect agent connection and state via audio activity
  useEffect(() => {
    const agentParticipant = remoteParticipants[0];

    if (agentParticipant && !agentConnected) {
      console.log('[AudioVisualizer] Agent connected:', agentParticipant.identity);
      setAgentConnected(true);
    }

    // Detect agent state based on audio activity since useVoiceAssistant() doesn't work with AgentSession
    if (agentConnected) {
      if (normalizedAgentVolume > 0.15) {
        // Agent is speaking (higher volume detected)
        if (agentState !== "speaking") {
          console.log('[AudioVisualizer] Agent state: speaking (audio detected)');
          setAgentState("speaking");
        }
      } else if (normalizedUserVolume > 0.3) {
        // User is speaking, agent should be listening
        if (agentState !== "listening") {
          console.log('[AudioVisualizer] Agent state: listening (user speaking)');
          setAgentState("listening");
        }
      } else {
        // No significant audio activity
        if (agentState !== "idle") {
          console.log('[AudioVisualizer] Agent state: idle');
          setAgentState("idle");
        }
      }
    }

    // Debug logging
    console.log('[AudioVisualizer] State:', agentState, '| User Vol:', normalizedUserVolume.toFixed(2), '| Agent Vol:', normalizedAgentVolume.toFixed(2), '| Participants:', remoteParticipants.length);
  }, [normalizedUserVolume, normalizedAgentVolume, remoteParticipants, agentConnected, agentState]);

  // Map LiveKit agent state to Orb agent state
  const orbAgentState: OrbAgentState =
    agentState === "thinking" ? "thinking" :
    agentState === "listening" ? "listening" :
    agentState === "speaking" ? "talking" :
    null;

  // Use debounced state for UI
  const isUserSpeaking = isUserSpeakingDebounced;
  const isAgentActive = agentState === "speaking" || agentState === "thinking";

  // Meelni purple-blue colors
  const meelniColors: [string, string] = ["oklch(0.70 0.22 285)", "oklch(0.55 0.22 285)"];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-8 p-6 interview-container">
      {/* Large Orb with Audio Reactivity */}
      <div className="relative w-full max-w-md aspect-square">
        <Orb
          colors={meelniColors}
          agentState={orbAgentState}
          getInputVolume={() => normalizedUserVolume}
          getOutputVolume={() => normalizedAgentVolume}
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
            {agentState === "thinking" ? "Meelni is thinking..." : "Meelni is speaking"}
          </p>
          <p className="text-sm font-sans text-muted-foreground">
            {agentState === "thinking" ? "Preparing response" : "Listen carefully"}
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

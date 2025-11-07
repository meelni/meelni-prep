"use client";

import { useEffect } from "react";
import {
  useLocalParticipant,
  useRemoteParticipants,
  BarVisualizer,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion, AnimatePresence } from "framer-motion";

export function AudioVisualizer() {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { state: agentState } = useVoiceAssistant();

  const userAudioTrack = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;

  const agentParticipant = remoteParticipants[0];
  const agentAudioTrack = agentParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;

  // Determine if audio is active
  const isUserSpeaking = userAudioTrack && userAudioTrack.isMuted === false;
  const isAgentActive = agentState === "speaking" || agentState === "thinking";

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-8 p-6">
      {/* Agent Avatar */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="relative"
      >
        {/* Subtle glow when agent is active */}
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-br from-primary to-primary/80 blur-xl transition-all duration-500 ${
            isAgentActive ? "opacity-20 scale-110" : "opacity-5 scale-100"
          }`}
        />

        {/* Avatar */}
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center shadow-lg border border-border">
          <span className="text-4xl font-bold text-background">M</span>
        </div>

        {/* Pulse ring when agent is speaking */}
        {agentState === "speaking" && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/50"
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* Agent Visualizer - Only show when active */}
      <AnimatePresence>
        {isAgentActive && agentAudioTrack && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.4, type: "spring" }}
            className="w-full max-w-2xl"
          >
            <div className="relative">
              <BarVisualizer
                state={agentState as any}
                barCount={60}
                trackRef={agentAudioTrack as any}
                className="h-32"
              />
              <div className="absolute -top-6 left-0 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>Agent</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Visualizer - Only show when speaking */}
      <AnimatePresence>
        {isUserSpeaking && userAudioTrack && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ duration: 0.4, type: "spring" }}
            className="w-full max-w-2xl"
          >
            <div className="relative">
              <BarVisualizer
                state="speaking"
                barCount={60}
                trackRef={userAudioTrack as any}
                className="h-32"
              />
              <div className="absolute -top-6 left-0 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>You</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready state message */}
      {!isAgentActive && !isUserSpeaking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-2"
        >
          <p className="text-lg font-medium text-foreground/80">Ready to begin</p>
          <p className="text-sm text-muted-foreground">Start speaking to continue the interview</p>
        </motion.div>
      )}
    </div>
  );
}

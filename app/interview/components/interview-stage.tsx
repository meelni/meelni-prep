"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Orb } from "@/components/ui/orb";
import { AgentStateBadge } from "./agent-state-badge";
import { InterviewControls } from "./interview-controls";
import { AudioVisualizer } from "./audio-visualizer";
import { useRef } from "react";
import { MEELNI_ORB_COLORS } from "@/lib/design-tokens";

type AgentState = "idle" | "listening" | "thinking" | "speaking";

interface InterviewStageProps {
  agentState: AgentState;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

// Map our agent state to Orb's expected state type
function mapAgentStateToOrbState(
  state: AgentState
): "thinking" | "listening" | "talking" | null {
  switch (state) {
    case "thinking":
      return "thinking";
    case "listening":
      return "listening";
    case "speaking":
      return "talking";
    case "idle":
    default:
      return null;
  }
}

export function InterviewStage({
  agentState,
  isMuted,
  onToggleMute,
  onEndSession,
}: InterviewStageProps) {
  const userVolumeRef = useRef<number>(0);
  const agentVolumeRef = useRef<number>(0);

  const orbState = mapAgentStateToOrbState(agentState);
  const isAgentActive = agentState === "speaking" || agentState === "thinking";

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-8 px-4 sm:gap-12">
      {/* Agent State Badge */}
      <AgentStateBadge state={agentState} />

      {/* Central Orb */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative aspect-square w-full max-w-[280px] sm:max-w-[320px] md:max-w-[400px]"
      >
        <Orb
          agentState={orbState}
          volumeMode="manual"
          inputVolumeRef={userVolumeRef}
          outputVolumeRef={agentVolumeRef}
          colors={MEELNI_ORB_COLORS}
          className="h-full w-full"
        />
      </motion.div>

      {/* Visualizer (shows below orb when active) */}
      <AnimatePresence mode="wait">
        {isAgentActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-2xl"
          >
            <AudioVisualizer />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls (directly below orb/visualizer) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-4"
      >
        <InterviewControls
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onEndSession={onEndSession}
        />
      </motion.div>
    </div>
  );
}

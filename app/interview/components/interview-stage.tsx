"use client";

import { motion } from "framer-motion";
import { AgentStateBadge } from "./agent-state-badge";
import { InterviewControls } from "./interview-controls";
import { AudioVisualizer } from "./audio-visualizer";

type AgentState = "idle" | "listening" | "thinking" | "speaking";

interface InterviewStageProps {
  agentState: AgentState;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

export function InterviewStage({
  agentState,
  isMuted,
  onToggleMute,
  onEndSession,
}: InterviewStageProps) {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-8 px-4 sm:gap-12">
      {/* Agent State Badge */}
      <AgentStateBadge state={agentState} />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="h-[260px] w-full max-w-[420px] sm:h-[320px]"
      >
        <AudioVisualizer agentState={agentState} />
      </motion.div>

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

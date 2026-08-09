"use client";

import { motion } from "framer-motion";
import { Mic, Volume2, Loader2, Circle } from "lucide-react";

type AgentState = "idle" | "listening" | "thinking" | "speaking";

interface AgentStateBadgeProps {
  state: AgentState;
}

const stateConfig = {
  idle: {
    color: "bg-muted/10 border-muted/20",
    textColor: "text-muted-foreground",
    icon: <Circle className="h-4 w-4" />,
    label: "Ready",
    glowColor: "shadow-muted/0",
  },
  listening: {
    color: "bg-info/10 border-info/20",
    textColor: "text-info",
    icon: <Mic className="h-4 w-4" />,
    label: "Listening",
    glowColor: "shadow-info/20",
  },
  thinking: {
    color: "bg-primary/10 border-primary/20",
    textColor: "text-primary",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: "Thinking",
    glowColor: "shadow-primary/20",
  },
  speaking: {
    color: "bg-success/10 border-success/20",
    textColor: "text-success",
    icon: <Volume2 className="h-4 w-4" />,
    label: "Speaking",
    glowColor: "shadow-success/20",
  },
} as const;

export function AgentStateBadge({ state }: AgentStateBadgeProps) {
  // Default to idle if state is undefined or invalid
  const validState: AgentState = state && state in stateConfig ? state : "idle";
  const config = stateConfig[validState];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-3 rounded-2xl border px-6 py-3 backdrop-blur-xl ${config.color} ${config.glowColor} shadow-lg`}
    >
      <motion.div
        animate={state === "listening" ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {config.icon}
      </motion.div>
      <span className={`text-sm font-medium ${config.textColor}`}>
        {config.label}
      </span>
      {state === "listening" && (
        <motion.div
          className="bg-info h-2 w-2 rounded-full"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

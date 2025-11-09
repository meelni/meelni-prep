"use client";

import { motion } from "framer-motion";
import { Mic, Brain, MessageSquare, Circle } from "lucide-react";

interface AgentStatusProps {
  state: "idle" | "listening" | "thinking" | "speaking";
}

export function AgentStatus({ state }: AgentStatusProps) {
  const stateConfig = {
    idle: {
      icon: Circle,
      label: "Idle",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      pulseColor: "oklch(0.60 0.015 264)",
    },
    listening: {
      icon: Mic,
      label: "Listening...",
      color: "text-primary",
      bgColor: "bg-primary/10",
      pulseColor: "oklch(0.70 0.22 285)",
    },
    thinking: {
      icon: Brain,
      label: "Thinking...",
      color: "text-primary/80",
      bgColor: "bg-primary/5",
      pulseColor: "oklch(0.65 0.20 275)",
    },
    speaking: {
      icon: MessageSquare,
      label: "Speaking...",
      color: "text-primary",
      bgColor: "bg-primary/20",
      pulseColor: "oklch(0.70 0.22 285)",
    },
  };

  // Fallback to idle if state is invalid
  const config = stateConfig[state] || stateConfig.idle;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3"
    >
      <motion.div
        className={`relative p-3 rounded-lg ${config.bgColor}`}
        animate={state !== "idle" ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {state !== "idle" && (
          <motion.div
            className="absolute inset-0 rounded-lg"
            style={{
              background: `radial-gradient(circle, ${config.pulseColor}22 0%, transparent 70%)`,
            }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <Icon className={`w-5 h-5 ${config.color} relative z-10`} />
      </motion.div>
      <div className="flex flex-col">
        <span className="text-sm font-medium">Meelni</span>
        <motion.span
          className={`text-xs ${config.color}`}
          animate={state !== "idle" ? { opacity: [0.6, 1, 0.6] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {config.label}
        </motion.span>
      </div>
    </motion.div>
  );
}

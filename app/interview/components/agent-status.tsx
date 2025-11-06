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
      pulseColor: "rgb(var(--muted-foreground))",
    },
    listening: {
      icon: Mic,
      label: "Listening...",
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
      pulseColor: "rgb(59, 130, 246)",
    },
    thinking: {
      icon: Brain,
      label: "Thinking...",
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-950",
      pulseColor: "rgb(147, 51, 234)",
    },
    speaking: {
      icon: MessageSquare,
      label: "Speaking...",
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
      pulseColor: "rgb(22, 163, 74)",
    },
  };

  const config = stateConfig[state];
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

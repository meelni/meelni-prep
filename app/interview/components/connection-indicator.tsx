"use client";

import { motion } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";
import { useConnectionQualityIndicator, useLocalParticipant } from "@livekit/components-react";

export function ConnectionIndicator() {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  // Map LiveKit connection quality (0-3) to our UI states
  const getQualityState = () => {
    if (quality === "unknown") return { color: "text-muted-foreground", label: "Connecting...", Icon: Wifi };
    if (quality === "poor") return { color: "text-red-500", label: "Poor connection", Icon: WifiOff };
    if (quality === "good") return { color: "text-amber-500", label: "Good connection", Icon: Wifi };
    return { color: "text-green-500", label: "Excellent connection", Icon: Wifi };
  };

  const { color, label, Icon } = getQualityState();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full border border-border/50"
      title={label}
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-xs font-medium ${color} hidden sm:inline`}>
        {label}
      </span>
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";
import {
  useConnectionQualityIndicator,
  useLocalParticipant,
} from "@livekit/components-react";

export function ConnectionIndicator() {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({
    participant: localParticipant,
  });

  // Map LiveKit connection quality (0-3) to our UI states
  const getQualityState = () => {
    if (quality === "unknown")
      return {
        color: "text-muted-foreground",
        label: "Connecting...",
        Icon: Wifi,
      };
    if (quality === "poor")
      return {
        color: "text-destructive",
        label: "Poor connection",
        Icon: WifiOff,
      };
    if (quality === "good")
      return { color: "text-warning", label: "Good connection", Icon: Wifi };
    return { color: "text-success", label: "Excellent connection", Icon: Wifi };
  };

  const { color, label, Icon } = getQualityState();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-muted/50 border-border/50 flex items-center gap-2 rounded-full border px-3 py-1.5"
      title={label}
      role="status"
      aria-label={`Connection: ${label}`}
    >
      <Icon className={`h-3.5 w-3.5 ${color}`} aria-hidden="true" />
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </motion.div>
  );
}

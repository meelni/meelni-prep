"use client";

import { Button } from "@/components/ui/button";
import { Lightbulb, Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";
import type { HintMode } from "@meelni/core";

interface InterviewControlsProps {
  isMuted: boolean;
  hintMode: HintMode;
  onToggleMute: () => void;
  onHintModeChange: (mode: HintMode) => void;
  onEndSession: () => void;
}

export function InterviewControls({
  isMuted,
  hintMode,
  onToggleMute,
  onHintModeChange,
  onEndSession,
}: InterviewControlsProps) {
  const hintsEnabled = hintMode !== "off";

  return (
    <div className="relative">
      {/* Mute indicator (above controls) */}
      {isMuted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-destructive text-destructive-foreground text-sm rounded-full shadow-lg whitespace-nowrap"
        >
          Microphone muted
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-center"
      >
        <div className="flex items-center gap-4 px-6 py-4 bg-card/80 backdrop-blur-xl border border-border rounded-full shadow-lg">
          {/* Mute/Unmute Button */}
          <Button
            variant={isMuted ? "outline" : "default"}
            size="lg"
            onClick={onToggleMute}
            className="relative rounded-full w-14 h-14 p-0 transition-all duration-300 hover:scale-105 active:scale-95"
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
            {/* Active indicator when not muted */}
            {!isMuted && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success animate-pulse" />
            )}
          </Button>

          {/* Hints Mode Button */}
          <Button
            variant={hintsEnabled ? "default" : "outline"}
            size="lg"
            onClick={() => onHintModeChange(hintsEnabled ? "off" : "gentle")}
            className="relative h-14 w-14 rounded-full p-0 transition-all duration-300 hover:scale-105 active:scale-95"
            title={hintsEnabled ? "Turn hints off" : "Turn gentle hints on"}
            aria-label={hintsEnabled ? "Turn hints off" : "Turn gentle hints on"}
            aria-pressed={hintsEnabled}
          >
            <Lightbulb className="h-6 w-6" />
            {hintsEnabled && (
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-success" />
            )}
          </Button>

          {/* End Session Button */}
          <Button
            variant="outline"
            size="lg"
            onClick={onEndSession}
            className="rounded-full w-14 h-14 p-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all duration-300 hover:scale-105 active:scale-95"
            title="End interview session"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>

        </div>
      </motion.div>
    </div>
  );
}

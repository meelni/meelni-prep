"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";

interface InterviewControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

export function InterviewControls({
  isMuted,
  onToggleMute,
  onEndSession,
}: InterviewControlsProps) {
  return (
    <div className="relative">
      {/* Mute indicator (above controls) */}
      {isMuted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-destructive text-destructive-foreground absolute -top-12 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm whitespace-nowrap shadow-lg"
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
        <div className="bg-card/80 border-border flex items-center gap-4 rounded-full border px-6 py-4 shadow-lg backdrop-blur-xl">
          {/* Mute/Unmute Button */}
          <Button
            variant={isMuted ? "outline" : "default"}
            size="lg"
            onClick={onToggleMute}
            className="relative h-14 w-14 rounded-full p-0 transition-all duration-300 hover:scale-105 active:scale-95"
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
            {/* Active indicator when not muted */}
            {!isMuted && (
              <div className="bg-success absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full" />
            )}
          </Button>

          {/* End Session Button */}
          <Button
            variant="outline"
            size="lg"
            onClick={onEndSession}
            className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive h-14 w-14 rounded-full p-0 transition-all duration-300 hover:scale-105 active:scale-95"
            title="End interview session"
            aria-label="End interview"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

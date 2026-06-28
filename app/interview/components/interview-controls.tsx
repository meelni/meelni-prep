"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Settings } from "lucide-react";
import { motion } from "framer-motion";

interface InterviewControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
  onOpenSettings?: () => void;
}

export function InterviewControls({
  isMuted,
  onToggleMute,
  onEndSession,
  onOpenSettings,
}: InterviewControlsProps) {
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
        <div className="flex items-center gap-4 px-6 py-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full shadow-lg">
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

          {/* Settings Button (Optional) */}
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="lg"
              onClick={onOpenSettings}
              className="rounded-full w-14 h-14 p-0 transition-all duration-300 hover:scale-105 active:scale-95"
              title="Open settings"
            >
              <Settings className="w-6 h-6" />
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

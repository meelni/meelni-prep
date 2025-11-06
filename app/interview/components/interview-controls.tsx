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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="flex items-center gap-4 px-6 py-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-full shadow-lg">
        {/* Mute/Unmute Button */}
        <Button
          variant={isMuted ? "outline" : "default"}
          size="lg"
          onClick={onToggleMute}
          className="rounded-full w-14 h-14 p-0"
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {isMuted ? (
            <MicOff className="w-6 h-6" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </Button>

        {/* End Session Button */}
        <Button
          variant="outline"
          size="lg"
          onClick={onEndSession}
          className="rounded-full w-14 h-14 p-0 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
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
            className="rounded-full w-14 h-14 p-0"
            title="Open settings"
          >
            <Settings className="w-6 h-6" />
          </Button>
        )}
      </div>

      {/* Mute indicator */}
      {isMuted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-sm rounded-full shadow-lg"
        >
          Microphone muted
        </motion.div>
      )}
    </motion.div>
  );
}

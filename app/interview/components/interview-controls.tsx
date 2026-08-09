"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";

interface InterviewControlsProps {
  isMuted: boolean;
  muteDisabled?: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

export function InterviewControls({
  isMuted,
  muteDisabled = false,
  onToggleMute,
  onEndSession,
}: InterviewControlsProps) {
  return (
    <div className="relative" role="group" aria-label="Interview controls">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-center"
      >
        <div className="bg-card/90 border-border flex items-center gap-2 rounded-xl border p-2 shadow-lg backdrop-blur-xl">
          <Button
            variant={isMuted ? "outline" : "default"}
            onClick={onToggleMute}
            disabled={muteDisabled}
            className="min-h-12 gap-2 rounded-lg px-4"
            title={
              muteDisabled
                ? "Microphone controls are unavailable while the interviewer joins or the connection recovers"
                : isMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
            }
            aria-label={
              muteDisabled
                ? "Microphone controls unavailable while the interviewer joins or the connection recovers"
                : isMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
            }
            aria-pressed={isMuted}
          >
            {isMuted ? (
              <MicOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
            <span>{isMuted ? "Mic off" : "Mic on"}</span>
          </Button>

          <Button
            variant="ghost"
            onClick={onEndSession}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive min-h-12 gap-2 rounded-lg px-4"
            title="End interview session"
            aria-label="End interview"
          >
            <PhoneOff className="h-5 w-5" aria-hidden="true" />
            <span>End</span>
          </Button>
        </div>
      </motion.div>
      <span className="sr-only" role="status" aria-live="polite">
        {muteDisabled
          ? "Microphone controls are unavailable while the interviewer joins or the connection recovers. End interview remains available."
          : isMuted
            ? "Microphone is off"
            : "Microphone is on"}
      </span>
    </div>
  );
}

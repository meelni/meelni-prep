"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";

interface InterviewControlsProps {
  isMuted: boolean;
  muteDisabled?: boolean;
  mutePending?: boolean;
  microphoneError?: string | null;
  onToggleMute: () => void;
  onEndSession: () => void;
}

export function InterviewControls({
  isMuted,
  muteDisabled = false,
  mutePending = false,
  microphoneError = null,
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
              mutePending
                ? "Waiting for microphone confirmation"
                : muteDisabled
                  ? "Microphone controls are unavailable while the interviewer joins or the connection recovers"
                  : microphoneError && isMuted
                    ? "Try microphone again"
                    : isMuted
                      ? "Unmute microphone"
                      : "Mute microphone"
            }
            aria-label={
              mutePending
                ? "Waiting for microphone confirmation"
                : muteDisabled
                  ? "Microphone controls unavailable while the interviewer joins or the connection recovers"
                  : microphoneError && isMuted
                    ? "Try microphone again"
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
      {microphoneError && (
        <div
          className="border-border bg-card text-foreground mx-auto mt-2 flex max-w-md items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle
            className="text-destructive h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{microphoneError}</span>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {mutePending
          ? isMuted
            ? "Starting microphone"
            : "Turning microphone off"
          : muteDisabled
            ? "Microphone controls are unavailable while the interviewer joins or the connection recovers. End interview remains available."
            : isMuted
              ? "Microphone is off"
              : "Microphone is on"}
      </span>
    </div>
  );
}

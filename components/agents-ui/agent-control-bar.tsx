"use client";

import { AlertCircle, Loader2, Mic, MicOff, PhoneOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AgentControlBarProps {
  isMuted: boolean;
  microphoneDisabled?: boolean;
  microphonePending?: boolean;
  microphoneError?: string | null;
  onMicrophoneToggle: () => void;
  onDisconnect: () => void;
  disconnectLabel: string;
  disconnectText?: string;
  disconnectIcon?: "phone" | "close";
  appearance?: "default" | "inverse";
  microphoneUnavailableLabel?: string;
  className?: string;
}

export function AgentControlBar({
  isMuted,
  microphoneDisabled = false,
  microphonePending = false,
  microphoneError = null,
  onMicrophoneToggle,
  onDisconnect,
  disconnectLabel,
  disconnectText = "End",
  disconnectIcon = "phone",
  appearance = "default",
  microphoneUnavailableLabel = "Microphone controls are unavailable while the interviewer joins or the connection recovers",
  className,
}: AgentControlBarProps) {
  const inverse = appearance === "inverse";
  const microphoneLabel = microphonePending
    ? "Waiting for microphone confirmation"
    : microphoneDisabled
      ? microphoneUnavailableLabel
      : microphoneError && isMuted
        ? "Try microphone again"
        : isMuted
          ? "Unmute microphone"
          : "Mute microphone";

  return (
    <div
      className={cn("relative", className)}
      role="group"
      aria-label="Voice session controls"
    >
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border p-2 shadow-lg backdrop-blur-xl",
          inverse
            ? "border-primary-foreground/10 bg-primary-foreground/5"
            : "border-border bg-card/90"
        )}
      >
        <Button
          type="button"
          variant={inverse ? "ghost" : isMuted ? "outline" : "default"}
          onClick={onMicrophoneToggle}
          disabled={microphoneDisabled || microphonePending}
          className={cn(
            "min-h-11 min-w-11 gap-2 rounded-lg px-4",
            inverse &&
              "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground",
            inverse &&
              isMuted &&
              "bg-destructive/80 hover:bg-destructive text-primary-foreground"
          )}
          title={microphoneLabel}
          aria-label={microphoneLabel}
          aria-pressed={isMuted}
        >
          {microphonePending ? (
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : isMuted ? (
            <MicOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
          <span>{isMuted ? "Mic off" : "Mic on"}</span>
        </Button>

        <div
          className={cn(
            "h-8 w-px",
            inverse ? "bg-primary-foreground/10" : "bg-border"
          )}
          aria-hidden="true"
        />

        <Button
          type="button"
          variant="ghost"
          onClick={onDisconnect}
          className={cn(
            "min-h-11 min-w-11 gap-2 rounded-lg px-4",
            inverse
              ? "bg-primary-foreground/10 text-primary-foreground hover:bg-destructive/20 hover:text-primary-foreground"
              : "text-destructive hover:bg-destructive/10 hover:text-destructive"
          )}
          title={disconnectLabel}
          aria-label={disconnectLabel}
        >
          {disconnectIcon === "close" ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <PhoneOff className="h-5 w-5" aria-hidden="true" />
          )}
          <span>{disconnectText}</span>
        </Button>
      </div>

      {microphoneError && (
        <div
          className={cn(
            "mx-auto mt-2 flex max-w-md items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm",
            inverse
              ? "border-primary-foreground/10 bg-overlay/80 text-primary-foreground"
              : "border-border bg-card text-foreground"
          )}
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
        {microphonePending
          ? isMuted
            ? "Starting microphone"
            : "Turning microphone off"
          : microphoneDisabled
            ? `${microphoneUnavailableLabel}. ${disconnectText} remains available.`
            : isMuted
              ? "Microphone is off"
              : "Microphone is on"}
      </span>
    </div>
  );
}

"use client";

import { AgentControlBar } from "@/components/agents-ui/agent-control-bar";

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
    <AgentControlBar
      isMuted={isMuted}
      microphoneDisabled={muteDisabled}
      microphonePending={mutePending}
      microphoneError={microphoneError}
      onMicrophoneToggle={onToggleMute}
      onDisconnect={onEndSession}
      disconnectLabel="End interview"
      microphoneUnavailableLabel="Microphone controls unavailable while the interviewer joins or the connection recovers"
    />
  );
}

"use client";

import { LiveKitRoom, useVoiceAssistant } from "@livekit/components-react";
import { useEffect, useState } from "react";

export interface TranscriptTurn {
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
  startedAt: Date;
  endedAt: Date;
  audioMs: number;
  latencyMs: number;
  section: string | null;
}

interface LiveKitRoomWrapperProps {
  token: string;
  url: string;
  roomName: string;
  sessionId: string;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  children: React.ReactNode;
}

export function LiveKitRoomWrapper({
  token,
  url,
  roomName,
  sessionId,
  onTranscriptUpdate,
  onAgentStateChange,
  children,
}: LiveKitRoomWrapperProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => {
        console.log("Connected to LiveKit room:", roomName);
        setIsConnected(true);
      }}
      onDisconnected={() => {
        console.log("Disconnected from LiveKit room");
        setIsConnected(false);
      }}
      onError={(error) => {
        console.error("LiveKit error:", error);
        setError(error.message);
      }}
    >
      <RoomContent
        sessionId={sessionId}
        onTranscriptUpdate={onTranscriptUpdate}
        onAgentStateChange={onAgentStateChange}
        isConnected={isConnected}
        error={error}
      >
        {children}
      </RoomContent>
    </LiveKitRoom>
  );
}

interface RoomContentProps {
  sessionId: string;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  isConnected: boolean;
  error: string | null;
  children: React.ReactNode;
}

function RoomContent({
  sessionId,
  onTranscriptUpdate,
  onAgentStateChange,
  isConnected,
  error,
  children,
}: RoomContentProps) {
  const { state, audioTrack } = useVoiceAssistant();

  // Subscribe to agent state changes
  useEffect(() => {
    if (state) {
      onAgentStateChange(state);
    }
  }, [state, onAgentStateChange]);

  // TODO: Subscribe to transcript updates from LiveKit
  // This will require integration with LiveKit's transcript events
  // For now, we'll handle this in the interview page

  return <>{children}</>;
}

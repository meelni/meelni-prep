"use client";

import { LiveKitRoom, useVoiceAssistant, useDataChannel } from "@livekit/components-react";
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
  const { message } = useDataChannel("transcript");

  // Subscribe to agent state changes
  useEffect(() => {
    if (state) {
      onAgentStateChange(state);
    }
  }, [state, onAgentStateChange]);

  // Subscribe to transcript data from agent
  useEffect(() => {
    if (message) {
      try {
        // Decode the data message (comes as Uint8Array)
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(message.payload);
        const transcriptData = JSON.parse(jsonString);

        console.log("[Transcript] Received:", transcriptData);

        // Convert to TranscriptTurn format
        const turn: TranscriptTurn = {
          speaker: transcriptData.speaker === "user" ? "user" : "interviewer",
          text: transcriptData.text,
          timestamp: new Date(transcriptData.timestamp * 1000), // Convert from seconds to ms
          startedAt: new Date(transcriptData.timestamp * 1000),
          endedAt: new Date(transcriptData.timestamp * 1000),
          audioMs: 0, // TODO: Calculate actual audio duration
          latencyMs: 0, // TODO: Calculate actual latency
          section: null, // TODO: Add section tracking
        };

        // Call the parent callback to save to database
        onTranscriptUpdate(turn);
      } catch (error) {
        console.error("[Transcript] Failed to parse transcript data:", error);
      }
    }
  }, [message, onTranscriptUpdate]);

  return <>{children}</>;
}

"use client";

import {
  LiveKitRoom,
  useVoiceAssistant,
  useDataChannel,
} from "@livekit/components-react";
import { useEffect, useRef } from "react";
import { analytics } from "@/lib/analytics/analytics-service";
import { parseTranscriptEvent } from "@meelni/agent";

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
  const connectionStartTime = useRef<number>(Date.now());

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => {
        console.log("Connected to LiveKit room:", roomName);

        // Track connection latency
        const connectionTime = Date.now() - connectionStartTime.current;
        const connectionQuality =
          connectionTime < 1000
            ? "excellent"
            : connectionTime < 3000
              ? "good"
              : "poor";

        analytics.track("livekit_connection_established", {
          session_id: sessionId,
          connection_time_ms: connectionTime,
          region: url.includes("livekit.cloud") ? "cloud" : "self-hosted",
          connection_quality: connectionQuality,
        });
      }}
      onDisconnected={() => {
        console.log("Disconnected from LiveKit room");
      }}
      onError={(error) => {
        console.error("LiveKit error:", error);
      }}
    >
      <RoomContent
        onTranscriptUpdate={onTranscriptUpdate}
        onAgentStateChange={onAgentStateChange}
      >
        {children}
      </RoomContent>
    </LiveKitRoom>
  );
}

interface RoomContentProps {
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  children: React.ReactNode;
}

function RoomContent({
  onTranscriptUpdate,
  onAgentStateChange,
  children,
}: RoomContentProps) {
  const { state } = useVoiceAssistant();
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
        const transcriptData = parseTranscriptEvent(jsonString);

        if (!transcriptData) {
          console.warn("[Transcript] Ignoring invalid transcript event");
          return;
        }

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

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
  eventId?: string;
  sequence?: number;
  sessionId?: string;
  roomName?: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
  startedAt: Date;
  endedAt: Date;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
  deliveryState?: "delivered" | "partially_delivered";
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
        roomName={roomName}
        sessionId={sessionId}
        onTranscriptUpdate={onTranscriptUpdate}
        onAgentStateChange={onAgentStateChange}
      >
        {children}
      </RoomContent>
    </LiveKitRoom>
  );
}

interface RoomContentProps {
  roomName: string;
  sessionId: string;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  children: React.ReactNode;
}

function RoomContent({
  roomName,
  sessionId,
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

        if (
          "contract_version" in transcriptData &&
          (transcriptData.session_id !== sessionId ||
            transcriptData.room_name !== roomName)
        ) {
          console.warn(
            "[Transcript] Ignoring event with mismatched correlation"
          );
          return;
        }

        console.log("[Transcript] Received:", transcriptData);

        const isLegacyEvent = !("contract_version" in transcriptData);
        const legacyTimestamp = isLegacyEvent
          ? new Date(transcriptData.timestamp * 1000)
          : null;

        // Legacy v1 packets remain readable during a rolling deployment, but
        // missing duration/section fields stay absent instead of being invented.
        const turn: TranscriptTurn = isLegacyEvent
          ? {
              speaker: transcriptData.speaker,
              text: transcriptData.text,
              timestamp: legacyTimestamp!,
              startedAt: legacyTimestamp!,
              endedAt: legacyTimestamp!,
            }
          : {
              eventId: transcriptData.event_id,
              sequence: transcriptData.sequence,
              sessionId: transcriptData.session_id,
              roomName: transcriptData.room_name,
              speaker: transcriptData.speaker,
              text: transcriptData.text,
              timestamp: new Date(transcriptData.started_at),
              startedAt: new Date(transcriptData.started_at),
              endedAt: new Date(transcriptData.ended_at),
              audioMs: transcriptData.audio_duration_ms,
              section: transcriptData.section,
              deliveryState: transcriptData.delivery_state,
            };

        // Call the parent callback to save to database
        onTranscriptUpdate(turn);
      } catch (error) {
        console.error("[Transcript] Failed to parse transcript data:", error);
      }
    }
  }, [message, onTranscriptUpdate, roomName, sessionId]);

  return <>{children}</>;
}

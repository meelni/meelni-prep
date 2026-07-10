"use client";

import {
  LiveKitRoom,
  useVoiceAssistant,
  useDataChannel,
} from "@livekit/components-react";
import { useCallback, useEffect, useRef } from "react";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  acceptTranscriptEventOnce,
  getTranscriptEventTiming,
  parseTranscriptEvent,
} from "@meelni/agent";

export interface TranscriptTurn {
  persistable?: boolean;
  eventId?: string;
  writerId?: string;
  sequence?: number;
  sessionId?: string;
  roomName?: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
  startedAt?: Date;
  endedAt?: Date;
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
  const acceptedTranscriptEvents = useRef(new Set<string>());
  const transcriptUpdateRef = useRef(onTranscriptUpdate);
  transcriptUpdateRef.current = onTranscriptUpdate;

  useEffect(() => {
    acceptedTranscriptEvents.current.clear();
  }, [roomName, sessionId]);

  // Subscribe to agent state changes
  useEffect(() => {
    if (state) {
      onAgentStateChange(state);
    }
  }, [state, onAgentStateChange]);

  const handleTranscriptMessage = useCallback(
    (message: { payload: Uint8Array }) => {
      try {
        const jsonString = new TextDecoder().decode(message.payload);
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

        if (
          !acceptTranscriptEventOnce(
            acceptedTranscriptEvents.current,
            transcriptData
          )
        ) {
          return;
        }

        console.log("[Transcript] Received:", transcriptData);

        const isLegacyEvent = !("contract_version" in transcriptData);
        const timing = getTranscriptEventTiming(transcriptData);

        // Legacy v1 packets remain readable during a rolling deployment, but
        // missing duration/section fields stay absent instead of being invented.
        const turn: TranscriptTurn = isLegacyEvent
          ? {
              persistable: false,
              speaker: transcriptData.speaker,
              text: transcriptData.text,
              timestamp: new Date(timing.timestampMs),
            }
          : {
              persistable: true,
              eventId: transcriptData.event_id,
              writerId: transcriptData.writer_id,
              sequence: transcriptData.sequence,
              sessionId: transcriptData.session_id,
              roomName: transcriptData.room_name,
              speaker: transcriptData.speaker,
              text: transcriptData.text,
              timestamp: new Date(timing.timestampMs),
              startedAt: new Date(timing.startedAtMs!),
              endedAt: new Date(timing.endedAtMs!),
              audioMs: timing.audioDurationMs,
              section: transcriptData.section,
              deliveryState: transcriptData.delivery_state,
            };

        transcriptUpdateRef.current(turn);
      } catch (error) {
        console.error("[Transcript] Failed to parse transcript data:", error);
      }
    },
    [roomName, sessionId]
  );

  useDataChannel("transcript", handleTranscriptMessage);

  return <>{children}</>;
}

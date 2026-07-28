"use client";

import {
  LiveKitRoom,
  useConnectionState,
  useVoiceAssistant,
  useDataChannel,
} from "@livekit/components-react";
import { useCallback, useEffect, useRef } from "react";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  reduceInterviewConnectionState,
  type InterviewConnectionStatus,
  type InterviewConnectionTracker,
  type RealtimeConnectionState,
} from "@/components/interview/session-recovery";
import {
  acceptTranscriptEventOnce,
  getTranscriptEventTiming,
  parseTranscriptEvent,
  type TranscriptEvent,
} from "@meelni/agent";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export interface TranscriptTurn {
  persistable?: boolean;
  event?: TranscriptEvent;
  eventId?: string;
  rowId?: string;
  writerId?: string;
  writerGeneration?: number;
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

export interface TranscriptRuntimeSettlement {
  settled: boolean;
  pending: number;
  failed: number;
  overflowed?: boolean;
  integrityUnavailable?: boolean;
}

export type FlushRuntimeTranscript = (
  timeoutMs?: number
) => Promise<TranscriptRuntimeSettlement>;

interface LiveKitRoomWrapperProps {
  token: string;
  url: string;
  roomName: string;
  sessionId: string;
  credentialGeneration: number;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  onConnectionStateChange: (state: InterviewConnectionStatus) => void;
  onTranscriptFlushAvailable: (flush: FlushRuntimeTranscript | null) => void;
  onTranscriptIntegrityChange: (
    state: "healthy" | "retrying" | "degraded"
  ) => void;
  children: React.ReactNode;
}

export function LiveKitRoomWrapper({
  token,
  url,
  roomName,
  sessionId,
  credentialGeneration,
  onTranscriptUpdate,
  onAgentStateChange,
  onConnectionStateChange,
  onTranscriptFlushAvailable,
  onTranscriptIntegrityChange,
  children,
}: LiveKitRoomWrapperProps) {
  const connectionStartTime = useRef<number>(Date.now());
  const acceptedTranscriptEvents = useRef(new Set<string>());
  const connectionTracker = useRef<InterviewConnectionTracker>({
    attemptObserved: false,
    recoveryObserved: false,
  });

  useEffect(() => {
    acceptedTranscriptEvents.current.clear();
    connectionTracker.current = {
      attemptObserved: false,
      recoveryObserved: false,
    };
  }, [roomName, sessionId]);

  return (
    <LiveKitRoom
      key={credentialGeneration}
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
        console.error("[Interview Runtime] livekit_error", {
          code: "livekit_runtime_error",
          ...toSafeErrorLog(error),
        });
      }}
    >
      <RoomContent
        roomName={roomName}
        sessionId={sessionId}
        acceptedTranscriptEvents={acceptedTranscriptEvents}
        connectionTracker={connectionTracker}
        onTranscriptUpdate={onTranscriptUpdate}
        onAgentStateChange={onAgentStateChange}
        onConnectionStateChange={onConnectionStateChange}
        onTranscriptFlushAvailable={onTranscriptFlushAvailable}
        onTranscriptIntegrityChange={onTranscriptIntegrityChange}
      >
        {children}
      </RoomContent>
    </LiveKitRoom>
  );
}

interface RoomContentProps {
  roomName: string;
  sessionId: string;
  acceptedTranscriptEvents: React.RefObject<Set<string>>;
  connectionTracker: React.RefObject<InterviewConnectionTracker>;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  onConnectionStateChange: (state: InterviewConnectionStatus) => void;
  onTranscriptFlushAvailable: (flush: FlushRuntimeTranscript | null) => void;
  onTranscriptIntegrityChange: (
    state: "healthy" | "retrying" | "degraded"
  ) => void;
  children: React.ReactNode;
}

function RoomContent({
  roomName,
  sessionId,
  acceptedTranscriptEvents,
  connectionTracker,
  onTranscriptUpdate,
  onAgentStateChange,
  onConnectionStateChange,
  onTranscriptFlushAvailable,
  onTranscriptIntegrityChange,
  children,
}: RoomContentProps) {
  const { state } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const transcriptUpdateRef = useRef(onTranscriptUpdate);
  const connectionStateChangeRef = useRef(onConnectionStateChange);
  transcriptUpdateRef.current = onTranscriptUpdate;
  connectionStateChangeRef.current = onConnectionStateChange;

  useEffect(() => {
    const flush: FlushRuntimeTranscript = async (timeoutMs = 10_000) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch("/api/interview/runtime-settlement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        });
      } catch {
        throw new Error(
          "The interview runtime took too long to respond. Please try ending again."
        );
      } finally {
        window.clearTimeout(timeout);
      }
      const result = (await response.json().catch(() => null)) as
        | (Partial<TranscriptRuntimeSettlement> & { message?: string })
        | null;
      if (!response.ok) {
        throw new Error(
          result?.message ||
            "We couldn't verify the complete transcript yet. Please try ending again."
        );
      }
      if (
        typeof result?.settled !== "boolean" ||
        !Number.isSafeInteger(result?.pending) ||
        !Number.isSafeInteger(result?.failed)
      ) {
        throw new Error("invalid_runtime_transcript_settlement");
      }
      return {
        settled: result.settled,
        pending: result.pending!,
        failed: result.failed!,
        overflowed: result.overflowed === true,
        integrityUnavailable: result.integrityUnavailable === true,
      };
    };

    onTranscriptFlushAvailable(flush);
    return () => onTranscriptFlushAvailable(null);
  }, [onTranscriptFlushAvailable, sessionId]);

  // Subscribe to agent state changes
  useEffect(() => {
    if (state) {
      onAgentStateChange(state);
    }
  }, [state, onAgentStateChange]);

  useEffect(() => {
    const transition = reduceInterviewConnectionState(
      connectionTracker.current,
      connectionState as RealtimeConnectionState
    );
    connectionTracker.current = transition.tracker;
    if (transition.status) {
      connectionStateChangeRef.current(transition.status);
    }
  }, [connectionState, connectionTracker]);

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
              event: transcriptData,
              eventId: transcriptData.event_id,
              rowId: transcriptData.row_id ?? transcriptData.event_id,
              writerId: transcriptData.writer_id,
              writerGeneration: transcriptData.writer_generation,
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
        console.error("[Transcript] parse_failed", {
          code: "transcript_packet_parse_failed",
          ...toSafeErrorLog(error),
        });
      }
    },
    [acceptedTranscriptEvents, roomName, sessionId]
  );

  useDataChannel("transcript", handleTranscriptMessage);

  const handleTranscriptStatus = useCallback(
    (message: { payload: Uint8Array }) => {
      try {
        const status = JSON.parse(
          new TextDecoder().decode(message.payload)
        ) as Record<string, unknown>;
        if (
          status.contract_version !== 1 ||
          status.session_id !== sessionId ||
          status.room_name !== roomName ||
          (status.state !== "healthy" &&
            status.state !== "retrying" &&
            status.state !== "degraded")
        ) {
          return;
        }
        onTranscriptIntegrityChange(status.state);
      } catch {
        console.warn("[Transcript] Ignoring invalid runtime status");
      }
    },
    [onTranscriptIntegrityChange, roomName, sessionId]
  );

  useDataChannel("transcript_status", handleTranscriptStatus);

  return <>{children}</>;
}

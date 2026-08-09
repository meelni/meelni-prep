"use client";

import {
  LiveKitRoom,
  useConnectionState,
  useVoiceAssistant,
  useDataChannel,
} from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  hasVerifiedInterviewerLiveness,
  reconcileInterviewCustomerConnectionStatus,
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
import { confirmInterviewRuntimeReady } from "@/lib/interview/runtime-connection-confirmation";
import {
  buildInterviewStartStageEvent,
  INTERVIEW_START_SLOS,
} from "@/lib/operations/interview-start-slo";
import {
  buildInterviewLivenessContradictionEvent,
  type InterviewLivenessContradictionResolution,
} from "@/lib/operations/interview-liveness-contradiction";

const DELAYED_READINESS_RETRY_MS = 5_000;

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

interface LiveKitRoomWrapperProps {
  token: string;
  url: string;
  roomName: string;
  sessionId: string;
  credentialGeneration: number;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  onConnectionStateChange: (state: InterviewConnectionStatus) => void;
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
  onTranscriptIntegrityChange,
  children,
}: LiveKitRoomWrapperProps) {
  const connectionStartTime = useRef<number>(Date.now());
  const transportStageGeneration = useRef<number | null>(null);
  const transportWatchdogTimer = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const connectionStateChangeRef = useRef(onConnectionStateChange);
  const acceptedTranscriptEvents = useRef(new Set<string>());
  const connectionTracker = useRef<InterviewConnectionTracker>({
    attemptObserved: false,
    recoveryObserved: false,
  });
  const interviewerLiveness = useRef({
    roomKey: "",
    established: false,
  });
  const roomKey = `${sessionId}:${roomName}`;
  connectionStateChangeRef.current = onConnectionStateChange;
  if (interviewerLiveness.current.roomKey !== roomKey) {
    interviewerLiveness.current = { roomKey, established: false };
  }

  useEffect(() => {
    acceptedTranscriptEvents.current.clear();
    connectionTracker.current = {
      attemptObserved: false,
      recoveryObserved: false,
    };
  }, [roomName, sessionId]);

  useEffect(() => {
    connectionStartTime.current = Date.now();
    transportStageGeneration.current = null;
    transportWatchdogTimer.current = setTimeout(() => {
      if (transportStageGeneration.current === credentialGeneration) return;
      transportStageGeneration.current = credentialGeneration;
      trackInterviewStartStage(
        "transport_connection",
        "delayed",
        INTERVIEW_START_SLOS.transport_connection.upperBoundMs
      );
      connectionStateChangeRef.current("transport_delayed");
    }, INTERVIEW_START_SLOS.transport_connection.upperBoundMs);

    return () => {
      if (transportWatchdogTimer.current !== undefined) {
        clearTimeout(transportWatchdogTimer.current);
        transportWatchdogTimer.current = undefined;
      }
    };
  }, [credentialGeneration]);

  return (
    <LiveKitRoom
      key={credentialGeneration}
      token={token}
      serverUrl={url}
      connect={true}
      audio={false}
      video={false}
      onConnected={() => {
        console.log("Connected to LiveKit room:", roomName);
        if (transportWatchdogTimer.current !== undefined) {
          clearTimeout(transportWatchdogTimer.current);
          transportWatchdogTimer.current = undefined;
        }

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
        if (transportStageGeneration.current !== credentialGeneration) {
          transportStageGeneration.current = credentialGeneration;
          trackInterviewStartStage(
            "transport_connection",
            "succeeded",
            connectionTime
          );
        }
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
        interviewerLiveness={interviewerLiveness}
        onTranscriptUpdate={onTranscriptUpdate}
        onAgentStateChange={onAgentStateChange}
        onConnectionStateChange={onConnectionStateChange}
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
  interviewerLiveness: React.RefObject<{
    roomKey: string;
    established: boolean;
  }>;
  onTranscriptUpdate: (turn: TranscriptTurn) => void;
  onAgentStateChange: (state: string) => void;
  onConnectionStateChange: (state: InterviewConnectionStatus) => void;
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
  interviewerLiveness,
  onTranscriptUpdate,
  onAgentStateChange,
  onConnectionStateChange,
  onTranscriptIntegrityChange,
  children,
}: RoomContentProps) {
  const { agent, state } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const [livenessRepairGeneration, setLivenessRepairGeneration] = useState(0);
  const transcriptUpdateRef = useRef(onTranscriptUpdate);
  const connectionStateChangeRef = useRef(onConnectionStateChange);
  const baseConnectionStatusRef =
    useRef<InterviewConnectionStatus>("connecting");
  const confirmationGenerationRef = useRef(0);
  const agentIdentityRef = useRef<string | null>(null);
  const contradictionRef = useRef<{ startedAt: number } | null>(null);
  transcriptUpdateRef.current = onTranscriptUpdate;
  connectionStateChangeRef.current = onConnectionStateChange;
  agentIdentityRef.current = agent?.identity ?? null;

  const beginReadinessContradiction = useCallback(() => {
    if (contradictionRef.current) return;
    contradictionRef.current = { startedAt: Date.now() };
    trackReadinessContradiction(
      buildInterviewLivenessContradictionEvent({
        phase: "observed",
        durationMs: 0,
        resolution: "pending",
      })
    );
  }, []);

  const resolveReadinessContradiction = useCallback(
    (
      resolution: Exclude<InterviewLivenessContradictionResolution, "pending">
    ) => {
      const contradiction = contradictionRef.current;
      if (!contradiction) return;
      contradictionRef.current = null;
      trackReadinessContradiction(
        buildInterviewLivenessContradictionEvent({
          phase: "resolved",
          durationMs: Date.now() - contradiction.startedAt,
          resolution,
        })
      );
    },
    []
  );

  const emitConnectionStatus = useCallback(
    (status: InterviewConnectionStatus) => {
      baseConnectionStatusRef.current = status;
      if (status === "delayed" && interviewerLiveness.current.established) {
        beginReadinessContradiction();
      } else if (status === "connected" || status === "recovered") {
        resolveReadinessContradiction("canonical_ready");
      } else if (status === "reconnecting" || status === "disconnected") {
        resolveReadinessContradiction("transport_interrupted");
      }
      connectionStateChangeRef.current(
        reconcileInterviewCustomerConnectionStatus(
          status,
          interviewerLiveness.current.established
        )
      );
    },
    [
      beginReadinessContradiction,
      interviewerLiveness,
      resolveReadinessContradiction,
    ]
  );

  const establishInterviewerLiveness = useCallback(() => {
    if (interviewerLiveness.current.established) return;
    interviewerLiveness.current.established = true;
    const promptImmediateRepair = baseConnectionStatusRef.current === "delayed";
    if (promptImmediateRepair) {
      beginReadinessContradiction();
    }
    connectionStateChangeRef.current(
      reconcileInterviewCustomerConnectionStatus(
        baseConnectionStatusRef.current,
        true
      )
    );
    // Browser evidence does not activate the lifecycle. It only starts a fresh
    // authenticated provider reconciliation while correcting the room UX.
    if (promptImmediateRepair) {
      setLivenessRepairGeneration((generation) => generation + 1);
    }
  }, [beginReadinessContradiction, interviewerLiveness]);

  // Subscribe to agent state changes
  useEffect(() => {
    if (state) {
      onAgentStateChange(state);
    }
    if (
      agent &&
      hasVerifiedInterviewerLiveness({
        agentActive: agent.isActive,
        agentState: state,
      })
    ) {
      establishInterviewerLiveness();
    }
  }, [agent, establishInterviewerLiveness, onAgentStateChange, state]);

  useEffect(
    () => () => resolveReadinessContradiction("unmounted"),
    [resolveReadinessContradiction]
  );

  useEffect(() => {
    const transition = reduceInterviewConnectionState(
      connectionTracker.current,
      connectionState as RealtimeConnectionState
    );
    connectionTracker.current = transition.tracker;
    if (!transition.status) return;
    if (
      transition.status !== "connected" &&
      transition.status !== "recovered"
    ) {
      emitConnectionStatus(transition.status);
      return;
    }

    const controller = new AbortController();
    const confirmationGeneration = ++confirmationGenerationRef.current;
    const readyStatus = transition.status;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let delayed = false;

    const confirmReady = async () => {
      if (controller.signal.aborted) return;
      emitConnectionStatus(
        delayed
          ? "delayed"
          : readyStatus === "recovered"
            ? "reconnecting"
            : "connecting"
      );
      const confirmation = await confirmInterviewRuntimeReady({
        sessionId,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        confirmationGeneration !== confirmationGenerationRef.current ||
        confirmation.status === "aborted"
      ) {
        return;
      }
      if (confirmation.status === "ready") {
        delayed = false;
        trackInterviewStartStage(
          "canonical_readiness",
          "succeeded",
          confirmation.durationMs
        );
        emitConnectionStatus(readyStatus);
        return;
      }
      if (confirmation.status === "terminal") {
        trackInterviewStartStage(
          "canonical_readiness",
          "terminal",
          confirmation.durationMs
        );
        resolveReadinessContradiction("terminal");
        emitConnectionStatus("disconnected");
        return;
      }

      delayed = true;
      trackInterviewStartStage(
        "canonical_readiness",
        "delayed",
        confirmation.durationMs
      );
      emitConnectionStatus("delayed");
      retryTimer = setTimeout(() => {
        void confirmReady();
      }, DELAYED_READINESS_RETRY_MS);
    };

    void confirmReady();
    return () => {
      controller.abort();
      if (confirmationGenerationRef.current === confirmationGeneration) {
        confirmationGenerationRef.current += 1;
      }
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [
    connectionState,
    connectionTracker,
    emitConnectionStatus,
    livenessRepairGeneration,
    resolveReadinessContradiction,
    sessionId,
  ]);

  const handleTranscriptMessage = useCallback(
    (message: {
      payload: Uint8Array;
      from?: { identity: string; isAgent: boolean };
    }) => {
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
          transcriptData.speaker === "interviewer" &&
          message.from?.isAgent === true &&
          (!agentIdentityRef.current ||
            message.from.identity === agentIdentityRef.current)
        ) {
          establishInterviewerLiveness();
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
    [
      acceptedTranscriptEvents,
      establishInterviewerLiveness,
      roomName,
      sessionId,
    ]
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

function trackInterviewStartStage(
  stage: "transport_connection" | "canonical_readiness",
  outcome: "succeeded" | "delayed" | "terminal",
  durationMs: number
) {
  const event = buildInterviewStartStageEvent({ stage, outcome, durationMs });
  if (!event) return;
  analytics.track("interview_start_stage", {
    version: event.version,
    stage: event.stage,
    outcome: event.outcome,
    duration_ms: event.durationMs,
    slo_target_ms: event.sloTargetMs,
    slo_upper_bound_ms: event.sloUpperBoundMs,
    latency_class: event.latencyClass,
  });
}

function trackReadinessContradiction(
  event: ReturnType<typeof buildInterviewLivenessContradictionEvent>
) {
  analytics.track("interview_liveness_contradiction", event);
}

"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import {
  acceptTranscriptEventOnce,
  getTranscriptEventTiming,
  parseTranscriptEvent,
} from "@meelni/agent";
import { ConnectionState } from "livekit-client";
import { FileKey2, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AudioVisualizer } from "@/app/interview/components/audio-visualizer";
import { ConnectionIndicator } from "@/app/interview/components/connection-indicator";
import { InterviewControls } from "@/app/interview/components/interview-controls";
import { InterviewRoomSurface } from "@/app/interview/components/interview-room-surface";
import { TranscriptPanel } from "@/app/interview/components/transcript-panel";
import { useAcknowledgedMicrophone } from "@/components/interview/use-acknowledged-microphone";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import type { InterviewConnectionStatus } from "@/components/interview/session-recovery";
import {
  parseProductionWebShadowConnectionJson,
  PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES,
  type ProductionWebShadowConnection,
} from "@/lib/interview/production-shadow-canary";

const INVALID_FILE_MESSAGE =
  "This connection file is invalid, expired, or belongs to another Shadow run.";

export function ProductionShadowCanaryClient({
  expectedRunId,
  expectedCandidateGitSha,
}: {
  expectedRunId: string;
  expectedCandidateGitSha: string;
}) {
  const [prepared, setPrepared] =
    useState<ProductionWebShadowConnection | null>(null);
  const [active, setActive] = useState<ProductionWebShadowConnection | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const readConnection = useCallback(
    async (file: File | undefined) => {
      setPrepared(null);
      setActive(null);
      setError(null);
      if (
        !file ||
        file.size === 0 ||
        file.size > PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES
      ) {
        setError(INVALID_FILE_MESSAGE);
        return;
      }
      setReading(true);
      try {
        const contents = await file.text();
        const parsed = parseProductionWebShadowConnectionJson(contents, {
          runId: expectedRunId,
          candidateGitSha: expectedCandidateGitSha,
          now: new Date(),
        });
        setPrepared(parsed);
      } catch {
        setError(INVALID_FILE_MESSAGE);
      } finally {
        setReading(false);
      }
    },
    [expectedCandidateGitSha, expectedRunId]
  );

  if (active) {
    return (
      <div className="bg-background fixed inset-0 z-50">
        <LiveKitRoom
          token={active.room.token}
          serverUrl={active.room.url}
          connect={true}
          audio={false}
          video={false}
          onDisconnected={() => {
            setActive(null);
            setPrepared(null);
          }}
          onError={() => {
            setActive(null);
            setPrepared(null);
            setError("The private Shadow room could not be connected.");
          }}
        >
          <RoomAudioRenderer />
          <ProductionShadowRoom
            connection={active}
            onExit={() => {
              setActive(null);
              setPrepared(null);
            }}
          />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
      <div className="space-y-2">
        <StatusPill tone="warning">Owner-only Production canary</StatusPill>
        <h1 className="font-display text-3xl font-light tracking-tight">
          Adaptive interviewer Shadow test
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-6">
          Join one already-authorized synthetic Shadow room through Meelni’s
          Production voice interface. This does not create a customer session,
          save a transcript, generate feedback, or enable Director influence.
        </p>
      </div>

      <AppSurface variant="panel" size="none" className="overflow-hidden">
        <AppSurfaceHeader>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
              <FileKey2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <AppSurfaceTitle>Load the private connection</AppSurfaceTitle>
              <AppSurfaceDescription>
                Select the fresh external connection.json created by the guarded
                operator. Its token stays only in this page’s memory.
              </AppSurfaceDescription>
            </div>
          </div>
        </AppSurfaceHeader>

        <div className="space-y-5 p-6 pt-0">
          <label className="border-border bg-muted/20 hover:bg-muted/40 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors">
            {reading ? (
              <Loader2
                className="text-primary h-6 w-6 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck
                className="text-primary h-6 w-6"
                aria-hidden="true"
              />
            )}
            <span className="text-sm font-medium">
              {reading ? "Checking connection…" : "Choose connection.json"}
            </span>
            <span className="text-muted-foreground text-xs">
              Strict v2 Production-project files only · maximum 32 KiB
            </span>
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              disabled={reading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void readConnection(file);
              }}
            />
          </label>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          {prepared && (
            <div className="border-border bg-muted/20 space-y-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="success">Verified locally</StatusPill>
                <StatusPill tone="muted">
                  {formatLabel(prepared.round)}
                </StatusPill>
                <StatusPill tone="muted">
                  {formatLabel(prepared.voice_condition)}
                </StatusPill>
              </div>
              <p className="text-muted-foreground text-sm">
                The file matches this exact run, worker candidate, Production
                LiveKit project, immutable configuration, room binding, and
                current lease window.
              </p>
              <Button
                type="button"
                onClick={() => {
                  if (new Date(prepared.expires_at).getTime() <= Date.now()) {
                    setPrepared(null);
                    setError(INVALID_FILE_MESSAGE);
                    return;
                  }
                  setActive(prepared);
                }}
              >
                Join one-time Shadow room
              </Button>
            </div>
          )}
        </div>
      </AppSurface>
    </div>
  );
}

function ProductionShadowRoom({
  connection,
  onExit,
}: {
  connection: ProductionWebShadowConnection;
  onExit: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { agent, state } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled, lastMicrophoneError } =
    useLocalParticipant();
  const [turns, setTurns] = useState<
    Array<{
      eventId: string;
      speaker: "user" | "interviewer";
      text: string;
      timestamp: Date;
    }>
  >([]);
  const acceptedEvents = useRef(new Set<string>());
  const status = mapConnectionStatus(connectionState);
  const canUseMicrophone =
    connectionState === ConnectionState.Connected && agent?.isActive === true;
  const microphone = useAcknowledgedMicrophone({
    participant: localParticipant,
    actualEnabled: isMicrophoneEnabled,
    canUseMicrophone,
    autoActivate: false,
    providerError: lastMicrophoneError,
    onAutoActivationAcknowledged: () => undefined,
    onUserToggleAcknowledged: () => undefined,
  });

  const handleTranscript = useCallback(
    (message: { payload: Uint8Array; from?: { isAgent: boolean } }) => {
      if (message.from?.isAgent !== true) return;
      try {
        const event = parseTranscriptEvent(
          new TextDecoder().decode(message.payload)
        );
        if (
          !event ||
          !("contract_version" in event) ||
          event.room_name !== connection.room.roomName ||
          !acceptTranscriptEventOnce(acceptedEvents.current, event)
        ) {
          return;
        }
        const timing = getTranscriptEventTiming(event);
        setTurns((current) => [
          ...current,
          {
            eventId: event.event_id,
            speaker: event.speaker,
            text: event.text,
            timestamp: new Date(timing.timestampMs),
          },
        ]);
      } catch {
        return;
      }
    },
    [connection.room.roomName]
  );
  useDataChannel("transcript", handleTranscript);

  useEffect(
    () => () => {
      acceptedEvents.current.clear();
    },
    []
  );

  const disconnect = useCallback(() => {
    void localParticipant
      .setMicrophoneEnabled(false)
      .catch(() => undefined)
      .then(() => room.disconnect())
      .catch(() => undefined)
      .finally(onExit);
  }, [localParticipant, onExit, room]);

  return (
    <InterviewRoomSurface
      connectionIndicator={<ConnectionIndicator status={status} />}
      connectionStatus={status}
      controls={
        <InterviewControls
          isMuted={!microphone.enabled}
          muteDisabled={!canUseMicrophone || microphone.pending}
          mutePending={microphone.pending}
          microphoneError={microphone.errorMessage}
          onToggleMute={microphone.toggle}
          onEndSession={disconnect}
        />
      }
      deadlineReached={false}
      mediaVisualizer={
        <AudioVisualizer
          agentState={
            state === "listening" ||
            state === "thinking" ||
            state === "speaking"
              ? state
              : "idle"
          }
        />
      }
      question="Owner-only adaptive interviewer Shadow rehearsal"
      roundType={connection.round}
      timer={<StatusPill tone="warning">Influence off · not saved</StatusPill>}
      transcriptIntegrity="healthy"
      transcriptHydrationState="ready"
      transcriptPanel={<TranscriptPanel turns={turns} />}
    />
  );
}

function mapConnectionStatus(
  state: ConnectionState
): InterviewConnectionStatus {
  if (state === ConnectionState.Connected) return "connected";
  if (state === ConnectionState.Reconnecting) return "reconnecting";
  if (state === ConnectionState.Disconnected) return "disconnected";
  return "connecting";
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

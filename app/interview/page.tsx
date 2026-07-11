"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { sessionKeys } from "@/lib/api/queries";
import {
  LiveKitRoomWrapper,
  TranscriptTurn,
} from "@/components/interview/livekit-room";
import { TranscriptPanel } from "./components/transcript-panel";
import { AudioVisualizer } from "./components/audio-visualizer";
import { InterviewControls } from "./components/interview-controls";
import { TimerDisplay } from "./components/timer-display";
import { EndSessionModal } from "./components/end-session-modal";
import { ConnectionIndicator } from "./components/connection-indicator";
import { NudgeOverlay, Nudge } from "@/components/interview/nudge-overlay";
import { useLocalParticipant } from "@livekit/components-react";
import { RoomAudioRenderer } from "@livekit/components-react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { getTranscriptQueue } from "@/lib/utils/transcript-queue";
import { analytics } from "@/lib/analytics/analytics-service";
import { shouldAnalyzeNudges, type HintMode } from "@meelni/core";

interface InterviewSession {
  id: string;
  livekit_room_name: string;
  started_at: string;
  config: {
    duration?: number;
    difficulty?: string;
    mode?: string;
    roundType?: string;
    [key: string]: unknown;
  };
  question?: {
    id: string;
    text: string;
    company: string | null;
  } | null;
}

interface PersistedInterviewSession {
  id: string;
  livekitRoomName: string | null;
  startedAt: string;
  roundType?: string | null;
  mode?: string | null;
  config?:
    | (Record<string, unknown> & {
        roundType?: string | null;
        mode?: string | null;
        difficulty?: string | null;
      })
    | null;
}

function InterviewPageContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Track Web Vitals performance
  useWebVitals("interview");

  // Config from Setup Modal (query params)
  const roundType = searchParams.get("roundType");
  const modeParam = searchParams.get("mode");
  // Ensure mode is valid (fallback for cached URLs with "mock_interview")
  const mode = modeParam === "mock_interview" ? "voice_video" : modeParam;
  const questionId = searchParams.get("questionId"); // Optional: pre-selected question

  // Session info (after session is created)
  const sessionId = searchParams.get("sessionId");
  const tokenParam = searchParams.get("token");
  const urlParam = searchParams.get("url");

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [token, setToken] = useState<string>(tokenParam || "");
  const [url, setUrl] = useState<string>(urlParam || "");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptSaveErrors, setTranscriptSaveErrors] = useState(0);
  const [transcriptQueue] = useState(() => getTranscriptQueue());
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);
  const [hintMode, setHintMode] = useState<HintMode>("off");
  const [agentState, setAgentState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const initializedRef = useRef(false);
  const activeSessionId = session?.id ?? sessionId ?? "";

  useEffect(() => {
    const configuredHintMode = session?.config?.hintMode;
    if (isHintMode(configuredHintMode)) {
      setHintMode(configuredHintMode);
    }
  }, [session?.config?.hintMode]);

  // Invalidate queries when component unmounts (user leaves interview)
  useEffect(() => {
    return () => {
      console.log("Interview page unmounting, invalidating sessions queries");
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    };
  }, [queryClient]);

  const createSession = useCallback(async () => {
    if (!roundType || !mode || !user) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundType,
          mode,
          questionId: questionId || undefined, // Include questionId if present
          config: {
            hintMode,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      const data = await response.json();

      // Set state directly without navigating (prevents component remount)
      setToken(data.token);
      setUrl(data.url);
      setSession({
        id: data.sessionId,
        livekit_room_name: data.roomName,
        started_at: new Date().toISOString(),
        config: {
          ...data.config,
          roundType,
          mode,
        },
        question: data.question || null,
      });
      setSessionStartTime(Date.now());
      setLoading(false);

      // Track interview started
      analytics.track("interview_started", {
        session_id: data.sessionId,
        interview_type: roundType,
        mode: mode,
        skill_level: data.config?.difficulty,
      });
    } catch (err) {
      console.error("Error creating session:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create interview session"
      );
      setLoading(false);
    }
  }, [hintMode, mode, questionId, roundType, user]);

  const fetchSessionDetails = useCallback(async () => {
    if (!sessionId || !user) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/session/${sessionId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch session details");
      }

      const { session: sessionData } = (await response.json()) as {
        session: PersistedInterviewSession;
      };
      const normalizedSession = normalizePersistedSession(sessionData);
      setSession(normalizedSession);
      setSessionStartTime(Date.now());
      setLoading(false);

      // Track interview started
      analytics.track("interview_started", {
        session_id: sessionId ?? "",
        interview_type: normalizedSession.config.roundType,
        mode: normalizedSession.config.mode,
        skill_level: normalizedSession.config.difficulty,
      });
    } catch (err) {
      console.error("Error fetching session:", err);
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    }
  }, [sessionId, user]);

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current) return;

    if (authLoading) return;

    if (!user) {
      router.push("/auth/signin?redirectTo=/interview");
      return;
    }

    // Case 1: Config params present (from Setup Modal) → create session
    if (roundType && mode && !sessionId) {
      createSession();
      initializedRef.current = true;
      return;
    }

    // Case 2: Session ID present → fetch session details
    if (sessionId && tokenParam && urlParam) {
      fetchSessionDetails();
      initializedRef.current = true;
      return;
    }

    // Case 3: No valid params → redirect to dashboard
    if (!roundType && !sessionId) {
      router.push("/dashboard");
    }
  }, [
    authLoading,
    createSession,
    fetchSessionDetails,
    mode,
    roundType,
    router,
    sessionId,
    tokenParam,
    urlParam,
    user,
  ]);

  const handleTranscriptUpdate = async (turn: TranscriptTurn) => {
    if (!activeSessionId) {
      console.warn(
        "[Interview] Transcript received before session ID was available"
      );
      return;
    }

    // The LiveKit adapter rejects replayed packet identities before this
    // callback, so UI and persistence observe the same accepted turn exactly once.
    setTranscript((prev) => [...prev, turn]);

    if (turn.persistable === false) {
      console.warn(
        "[Interview] Displaying legacy transcript packet without invented persistence timing"
      );
      return;
    }

    // Save to database with automatic retry queue
    try {
      const result = await transcriptQueue.save({
        sessionId: activeSessionId,
        speaker: turn.speaker,
        text: turn.text,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        audioMs: turn.audioMs,
        latencyMs: turn.latencyMs,
        section: turn.section || undefined,
      });

      if (!result.success) {
        // Failed, but queued for retry
        setTranscriptSaveErrors((prev) => prev + 1);
        console.warn(
          "[Interview] Transcript save failed, queued for retry:",
          result.error
        );
      } else if (transcriptSaveErrors > 0) {
        // Success after previous errors - reset error count
        setTranscriptSaveErrors(0);
      }
    } catch (error) {
      // Unexpected error
      console.error("[Interview] Unexpected error saving transcript:", error);
      setTranscriptSaveErrors((prev) => prev + 1);
    }

    // Analyze for nudges (only when user finishes speaking)
    if (
      turn.speaker === "user" &&
      activeSessionId &&
      session?.config?.roundType &&
      shouldAnalyzeNudges(hintMode)
    ) {
      analyzeForNudges(turn);
    }
  };

  const analyzeForNudges = async (turn: TranscriptTurn) => {
    try {
      const timeElapsed = Math.floor(
        (new Date().getTime() - new Date(session!.started_at).getTime()) / 1000
      );

      const response = await fetch("/api/nudges/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          interviewType: session!.config.roundType,
          hintMode,
          currentTurn: {
            speaker: turn.speaker,
            text: turn.text,
            timestamp: turn.timestamp,
          },
          timeElapsed,
        }),
      });

      if (!response.ok) {
        console.warn("[Interview] Nudge analysis failed:", response.statusText);
        return;
      }

      const data = await response.json();

      // Display nudge if applicable
      if (data.shouldNudge && data.nudgeType && data.message) {
        setCurrentNudge({
          type: data.nudgeType,
          message: data.message,
        });
      }
    } catch (error) {
      console.error("[Interview] Error analyzing for nudges:", error);
      // Don't show error to user - nudges are optional enhancement
    }
  };

  const handleAgentStateChange = useCallback((state: string) => {
    const normalizedState = state.toLowerCase();
    if (
      normalizedState === "idle" ||
      normalizedState === "listening" ||
      normalizedState === "thinking" ||
      normalizedState === "speaking"
    ) {
      setAgentState(normalizedState);
    }
  }, []);

  // Auto-end session after configured duration
  useEffect(() => {
    if (!session?.started_at || !session?.config?.duration) return;

    const durationMs = session.config.duration * 60 * 1000; // Convert minutes to ms
    const startTime = new Date(session.started_at).getTime();
    const endTime = startTime + durationMs;
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) {
      // Duration already passed
      return;
    }

    // Set timer to auto-end session
    const timer = setTimeout(() => {
      console.log(
        `[Interview] Auto-ending session after ${session.config.duration} minutes`
      );
      setShowEndModal(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [session]);

  const handleEndSession = async () => {
    if (!activeSessionId) {
      setError(
        "Missing interview session. Please return to the dashboard and try again."
      );
      return;
    }

    setIsEndingSession(true);
    setEndSessionError(null);
    try {
      const duration = sessionStartTime
        ? (Date.now() - sessionStartTime) / 1000
        : 0;

      const response = await fetch("/api/interview/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        nextHref?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "We couldn't end the interview yet. You're still connected and can try again."
        );
      }

      analytics.track("interview_ended", {
        session_id: activeSessionId,
        duration_seconds: duration,
        ended_naturally: true,
        interview_type: session?.config?.roundType,
      });

      setShowEndModal(false);
      setIsEndingSession(false);

      const nextHref = data?.nextHref?.startsWith(
        `/feedback/${activeSessionId}`
      )
        ? data.nextHref
        : `/feedback/${activeSessionId}/loading`;
      router.push(nextHref);
    } catch (error) {
      console.error("Failed to end session:", error);
      setEndSessionError(
        error instanceof Error
          ? error.message
          : "We couldn't end the interview yet. You're still connected and can try again."
      );
      setIsEndingSession(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading interview room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="max-w-md text-center">
          <h1 className="mb-4 text-2xl font-bold">Failed to Load Interview</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!session || !token || !url) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Connecting to room...</p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoomWrapper
      token={token}
      url={url}
      roomName={session.livekit_room_name}
      sessionId={activeSessionId}
      onTranscriptUpdate={handleTranscriptUpdate}
      onAgentStateChange={handleAgentStateChange}
    >
      <RoomAudioRenderer />
      <InterviewRoomContent
        session={session}
        transcript={transcript}
        agentState={agentState}
        isMuted={isMuted}
        hintMode={hintMode}
        transcriptSaveErrors={transcriptSaveErrors}
        onHintModeChange={(mode) => {
          setHintMode(mode);
          analytics.track("hint_mode_changed", {
            session_id: activeSessionId,
            hint_mode: mode,
            interview_type: session.config?.roundType,
          });
        }}
        onToggleMute={() => {
          const newMutedState = !isMuted;
          setIsMuted(newMutedState);
          // Track mic toggle
          analytics.track("mic_toggled", {
            session_id: sessionId ?? session.id,
            new_state: newMutedState ? "muted" : "unmuted",
          });
        }}
        onEndSession={() => setShowEndModal(true)}
      />
      <NudgeOverlay
        nudge={currentNudge}
        onDismiss={() => {
          if (currentNudge) {
            analytics.track("hint_dismissed", {
              session_id: activeSessionId,
              hint_type: currentNudge.type,
              hint_mode: hintMode,
            });
          }
          setCurrentNudge(null);
        }}
      />
      <EndSessionModal
        isOpen={showEndModal}
        isLoading={isEndingSession}
        error={endSessionError}
        onClose={() => {
          setShowEndModal(false);
          setEndSessionError(null);
        }}
        onConfirm={handleEndSession}
      />
    </LiveKitRoomWrapper>
  );
}

interface InterviewRoomContentProps {
  session: InterviewSession;
  transcript: TranscriptTurn[];
  agentState: "idle" | "listening" | "thinking" | "speaking";
  isMuted: boolean;
  hintMode: HintMode;
  transcriptSaveErrors: number;
  onHintModeChange: (mode: HintMode) => void;
  onToggleMute: () => void;
  onEndSession: () => void;
}

function InterviewRoomContent({
  session,
  transcript,
  agentState,
  isMuted,
  hintMode,
  transcriptSaveErrors,
  onHintModeChange,
  onToggleMute,
  onEndSession,
}: InterviewRoomContentProps) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted);
    }
  }, [isMuted, localParticipant]);

  const estimatedDuration = session.config?.duration || 30;

  const roundLabel = session.config?.roundType
    ? session.config.roundType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter: string) => letter.toUpperCase())
    : "PM Interview";

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="bg-background/90 border-border sticky top-0 z-40 w-full border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <StatusPill tone="primary" className="shrink-0">
              {roundLabel}
            </StatusPill>
            <ConnectionIndicator />
          </div>
          <TimerDisplay
            startedAt={new Date(session.started_at)}
            estimatedDuration={estimatedDuration}
          />
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-7xl grid-cols-1 gap-0 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="flex min-h-[620px] flex-col items-center justify-between py-6 lg:min-h-[calc(100vh-6rem)] lg:pr-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 text-center">
            <div className="space-y-3">
              <StatusPill tone={hintMode === "off" ? "muted" : "primary"}>
                {hintMode === "off" ? "Real interview" : "Gentle hints on"}
              </StatusPill>
              <StatusPill tone="muted">
                {agentState.charAt(0).toUpperCase() + agentState.slice(1)}
              </StatusPill>
              <h1 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                {session.question?.text || "Your interviewer is ready."}
              </h1>
              {session.question?.company && (
                <p className="text-muted-foreground text-sm">
                  {session.question.company}
                </p>
              )}
            </div>

            <div className="h-[280px] w-full max-w-[520px] sm:h-[360px]">
              <AudioVisualizer />
            </div>
          </div>

          <div className="sticky bottom-4 z-30 mt-6">
            <InterviewControls
              isMuted={isMuted}
              hintMode={hintMode}
              onHintModeChange={onHintModeChange}
              onToggleMute={onToggleMute}
              onEndSession={onEndSession}
            />
          </div>
        </section>

        <aside className="border-border bg-card flex min-h-[420px] flex-col overflow-hidden rounded-lg border lg:sticky lg:top-[4.5rem] lg:h-[calc(100vh-5.5rem)]">
          <AppSurfaceHeader className="flex items-start justify-between gap-3">
            <div>
              <AppSurfaceTitle>Transcript</AppSurfaceTitle>
              <AppSurfaceDescription>
                Conversation turns are saved as the room runs.
              </AppSurfaceDescription>
            </div>
            {transcriptSaveErrors > 0 && (
              <StatusPill tone="warning" className="shrink-0">
                <AlertCircle className="h-3.5 w-3.5" />
                Saving
              </StatusPill>
            )}
          </AppSurfaceHeader>
          <div className="min-h-0 flex-1">
            <TranscriptPanel turns={transcript} />
          </div>
        </aside>
      </main>
    </div>
  );
}

function normalizePersistedSession(
  session: PersistedInterviewSession
): InterviewSession {
  return {
    id: session.id,
    livekit_room_name: session.livekitRoomName || "",
    started_at: session.startedAt,
    config: {
      ...(session.config || {}),
      roundType: session.roundType || session.config?.roundType || undefined,
      mode: session.mode || session.config?.mode || undefined,
      difficulty: session.config?.difficulty || undefined,
    },
    question: null,
  };
}

function isHintMode(value: unknown): value is HintMode {
  return value === "off" || value === "gentle" || value === "coach";
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p className="text-muted-foreground">Loading interview...</p>
          </div>
        </div>
      }
    >
      <InterviewPageContent />
    </Suspense>
  );
}

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
import { Loader2, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { getTranscriptQueue } from "@/lib/utils/transcript-queue";
import { requireInterviewResumeTiming } from "@/lib/interview/resume-session";
import { compareTranscriptOrdering } from "@/lib/workflows/ingest-transcript-event";
import { canNavigateToInterviewFeedback } from "@/lib/interview/deadline-view";
import { analytics } from "@/lib/analytics/analytics-service";
import { shouldAnalyzeNudges, type HintMode } from "@meelni/core";
import {
  getCanonicalInterviewHref,
  getCredentialRetryDelayMs,
  isInterviewRoomCredentialAuthorizationCurrent,
  parseInterviewRoomCredentials,
  shouldDiscardInterviewRoomCredentials,
  type InterviewConnectionStatus,
  type InterviewRoomCredentials,
} from "@/components/interview/session-recovery";
import { establishTranscriptEndCutoff } from "@/lib/utils/transcript-end-settlement";
import { reconcileAmbiguousInterviewEnd } from "@/lib/interview/end-reconciliation";

const TERMINAL_SESSION_STATES = new Set(["completed", "abandoned", "failed"]);

interface InterviewSession {
  id: string;
  livekit_room_name: string;
  started_at: string;
  deadline_at: string;
  lifecycle_state?: string | null;
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
  startedAt: string | null;
  deadlineAt: string;
  feedbackReady?: boolean;
  lifecycleState?: string | null;
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

type RoomCredentialFailure = {
  ok: false;
  status: number;
  error: string;
  message?: string;
  retryAfterMs: number | null;
};

type RoomCredentialResult =
  | { ok: true; credentials: InterviewRoomCredentials }
  | RoomCredentialFailure;

interface EndReconciliationState {
  ownerId: string;
  sessionId: string;
  durationSeconds: number;
}

export function InterviewPageContent() {
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

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const endIntentRef = useRef(false);
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
  const [deadlineReached, setDeadlineReached] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<InterviewConnectionStatus>("connecting");
  const [recoveringConnection, setRecoveringConnection] = useState(false);
  const [disconnectTimedOut, setDisconnectTimedOut] = useState(false);
  const [credentialGeneration, setCredentialGeneration] = useState(0);
  const [connectionOwnerId, setConnectionOwnerId] = useState<string | null>(
    null
  );
  const [endReconciliation, setEndReconciliation] =
    useState<EndReconciliationState | null>(null);
  const initializedRef = useRef(false);
  const deadlineReachedRef = useRef(false);
  const credentialRequestInFlightRef = useRef(false);
  const lastCredentialRequestAtRef = useRef(0);
  const recoveredStatusTimerRef = useRef<number | undefined>(undefined);
  const credentialRetryTimerRef = useRef<number | undefined>(undefined);
  const refreshRoomCredentialsRef = useRef<() => void>(() => undefined);
  const observedOwnerIdRef = useRef<string | null | undefined>(undefined);
  const ownerTransitionInProgressRef = useRef(false);
  const ownerIdRef = useRef<string | null>(user?.id ?? null);
  const nextEndRetryAtRef = useRef(0);
  ownerIdRef.current = user?.id ?? null;
  const activeSessionId = session?.id ?? sessionId ?? "";
  const hasCurrentConnectionOwner =
    connectionOwnerId !== null && connectionOwnerId === ownerIdRef.current;

  useEffect(() => {
    const nextOwnerId = user?.id ?? null;
    const previousOwnerId = observedOwnerIdRef.current;
    observedOwnerIdRef.current = nextOwnerId;

    if (previousOwnerId === undefined) {
      if (nextOwnerId) transcriptQueue.bindOwner(nextOwnerId);
      return;
    }
    if (previousOwnerId === nextOwnerId) return;

    if (recoveredStatusTimerRef.current !== undefined) {
      window.clearTimeout(recoveredStatusTimerRef.current);
      recoveredStatusTimerRef.current = undefined;
    }
    if (credentialRetryTimerRef.current !== undefined) {
      window.clearTimeout(credentialRetryTimerRef.current);
      credentialRetryTimerRef.current = undefined;
    }
    credentialRequestInFlightRef.current = false;
    lastCredentialRequestAtRef.current = 0;
    initializedRef.current = false;
    ownerTransitionInProgressRef.current = true;
    deadlineReachedRef.current = false;
    endIntentRef.current = false;
    nextEndRetryAtRef.current = 0;

    // Binding the next owner aborts and removes every prior-owner queue item.
    // A signed-out page has no owner to bind, so close the singleton entirely.
    if (nextOwnerId) transcriptQueue.bindOwner(nextOwnerId);
    else transcriptQueue.clear();

    setConnectionOwnerId(null);
    setSession(null);
    setToken("");
    setUrl("");
    setTranscript([]);
    setIsMuted(false);
    setTranscriptSaveErrors(0);
    setCurrentNudge(null);
    setHintMode("off");
    setAgentState("idle");
    setSessionStartTime(null);
    setDeadlineReached(false);
    setConnectionStatus("connecting");
    setRecoveringConnection(false);
    setDisconnectTimedOut(false);
    setCredentialGeneration(0);
    setShowEndModal(false);
    setIsEndingSession(false);
    setEndSessionError(null);
    setEndReconciliation(null);
    setError(null);
    setLoading(false);

    router.replace(
      nextOwnerId ? "/dashboard" : "/auth/signin?redirectTo=/interview"
    );
  }, [router, transcriptQueue, user?.id]);

  useEffect(() => {
    const configuredHintMode = session?.config?.hintMode;
    if (isHintMode(configuredHintMode)) {
      setHintMode(configuredHintMode);
    }
  }, [session?.config?.hintMode]);

  // Invalidate queries when component unmounts (user leaves interview)
  useEffect(() => {
    return () => {
      if (recoveredStatusTimerRef.current !== undefined) {
        window.clearTimeout(recoveredStatusTimerRef.current);
      }
      if (credentialRetryTimerRef.current !== undefined) {
        window.clearTimeout(credentialRetryTimerRef.current);
      }
      console.log("Interview page unmounting, invalidating sessions queries");
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    };
  }, [queryClient]);

  const createSession = useCallback(async () => {
    if (!roundType || !mode || !user) return;
    const requestOwnerId = user.id;

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
      if (ownerIdRef.current !== requestOwnerId) return;
      const credentials = parseInterviewRoomCredentials(data, data.roomName);
      if (!credentials || typeof data.sessionId !== "string") {
        throw new Error("Interview room credentials were invalid");
      }

      setToken(credentials.token);
      setUrl(credentials.url);
      setConnectionOwnerId(requestOwnerId);
      setSession({
        id: data.sessionId,
        livekit_room_name: data.roomName,
        started_at: new Date().toISOString(),
        deadline_at: data.deadlineAt,
        config: {
          ...data.config,
          roundType,
          mode,
        },
        question: data.question || null,
      });
      setSessionStartTime(Date.now());
      router.replace(getCanonicalInterviewHref(data.sessionId));
      setLoading(false);

      // Track interview started
      analytics.track("interview_started", {
        session_id: data.sessionId,
        interview_type: roundType,
        mode: mode,
        skill_level: data.config?.difficulty,
      });
    } catch (err) {
      if (ownerIdRef.current !== requestOwnerId) return;
      console.error("Error creating session:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create interview session"
      );
      setLoading(false);
    }
  }, [hintMode, mode, questionId, roundType, router, user]);

  const fetchSessionDetails = useCallback(async () => {
    if (!sessionId || !user) return;
    const requestOwnerId = user.id;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/session/${sessionId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch session details");
      }

      const { session: sessionData } = (await response.json()) as {
        session: PersistedInterviewSession;
      };
      if (ownerIdRef.current !== requestOwnerId) return;
      const normalizedSession = normalizePersistedSession(sessionData);
      setSession(normalizedSession);
      setSessionStartTime(new Date(normalizedSession.started_at).getTime());

      if (
        canNavigateToInterviewFeedback({
          lifecycleState: normalizedSession.lifecycle_state,
          feedbackReady: sessionData.feedbackReady,
        })
      ) {
        router.replace(`/feedback/${sessionId}/loading`);
        return;
      }

      if (
        normalizedSession.lifecycle_state === "ending" ||
        (normalizedSession.lifecycle_state !== undefined &&
          normalizedSession.lifecycle_state !== null &&
          TERMINAL_SESSION_STATES.has(normalizedSession.lifecycle_state))
      ) {
        setDisconnectTimedOut(true);
        setLoading(false);
        return;
      }

      const credentialResult = await requestInterviewRoomCredentialsWithRetry(
        sessionId,
        normalizedSession.livekit_room_name
      );
      if (ownerIdRef.current !== requestOwnerId) return;
      if (!credentialResult.ok) {
        if (shouldDiscardInterviewRoomCredentials(credentialResult.status)) {
          setToken("");
          setUrl("");
          setDisconnectTimedOut(true);
          setLoading(false);
          return;
        }
        if (credentialResult.retryAfterMs !== null) {
          setConnectionStatus("disconnected");
          setRecoveringConnection(true);
          setLoading(false);
          credentialRetryTimerRef.current = window.setTimeout(() => {
            credentialRetryTimerRef.current = undefined;
            lastCredentialRequestAtRef.current = 0;
            refreshRoomCredentialsRef.current();
          }, credentialResult.retryAfterMs);
          return;
        }
        throw new Error(
          credentialResult.message ||
            "We couldn't reconnect to this interview. Please try again."
        );
      }

      setToken(credentialResult.credentials.token);
      setUrl(credentialResult.credentials.url);
      setConnectionOwnerId(requestOwnerId);
      setLoading(false);
    } catch (err) {
      if (ownerIdRef.current !== requestOwnerId) return;
      console.error("Error fetching session:", err);
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    }
  }, [router, sessionId, user]);

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current || ownerTransitionInProgressRef.current) return;

    if (authLoading) return;

    if (!user) {
      router.push("/auth/signin?redirectTo=/interview");
      return;
    }

    if (
      sessionId &&
      searchParams.toString() !== new URLSearchParams({ sessionId }).toString()
    ) {
      router.replace(getCanonicalInterviewHref(sessionId));
    }

    // Case 1: Config params present (from Setup Modal) → create session
    if (roundType && mode && !sessionId) {
      createSession();
      initializedRef.current = true;
      return;
    }

    // Case 2: Session ID present → fetch session details
    if (sessionId) {
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
    searchParams,
    sessionId,
    user,
  ]);

  const handleTranscriptUpdate = async (turn: TranscriptTurn) => {
    const callbackOwnerId = connectionOwnerId;
    const callbackSessionId = activeSessionId;
    if (
      !callbackOwnerId ||
      callbackOwnerId !== ownerIdRef.current ||
      !callbackSessionId
    ) {
      console.warn(
        "[Interview] Ignoring transcript outside the active owner session"
      );
      return;
    }
    if (endIntentRef.current) {
      console.warn("[Interview] Ignoring transcript received after end intent");
      return;
    }

    // The LiveKit adapter rejects replayed packet identities before this
    // callback, so UI and persistence observe the same accepted turn exactly once.
    setTranscript((prev) => [...prev, turn].sort(compareTranscriptOrdering));

    if (turn.persistable === false) {
      console.warn(
        "[Interview] Displaying legacy transcript packet without invented persistence timing"
      );
      return;
    }

    if (!turn.event) {
      console.warn(
        "[Interview] Ignoring transcript turn without a canonical event"
      );
      return;
    }

    // Save to database with automatic retry queue
    try {
      const result = await transcriptQueue.save({
        ownerId: callbackOwnerId,
        sessionId: callbackSessionId,
        event: turn.event,
      });

      if (
        ownerIdRef.current !== callbackOwnerId ||
        connectionOwnerId !== callbackOwnerId
      ) {
        return;
      }

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
      if (
        ownerIdRef.current !== callbackOwnerId ||
        connectionOwnerId !== callbackOwnerId
      ) {
        return;
      }
      // Unexpected error
      console.error("[Interview] Unexpected error saving transcript:", error);
      setTranscriptSaveErrors((prev) => prev + 1);
    }

    // Analyze for nudges (only when user finishes speaking)
    if (
      turn.speaker === "user" &&
      callbackSessionId &&
      session?.config?.roundType &&
      shouldAnalyzeNudges(hintMode)
    ) {
      void analyzeForNudges(turn, callbackOwnerId, callbackSessionId);
    }
  };

  const analyzeForNudges = async (
    turn: TranscriptTurn,
    requestOwnerId: string,
    requestSessionId: string
  ) => {
    if (ownerIdRef.current !== requestOwnerId || !session) return;
    const requestStartedAt = session.started_at;
    const requestRoundType = session.config.roundType;
    try {
      const timeElapsed = Math.floor(
        (new Date().getTime() - new Date(requestStartedAt).getTime()) / 1000
      );

      const response = await fetch("/api/nudges/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: requestSessionId,
          interviewType: requestRoundType,
          hintMode,
          currentTurn: {
            speaker: turn.speaker,
            text: turn.text,
            timestamp: turn.timestamp,
          },
          timeElapsed,
        }),
      });

      if (ownerIdRef.current !== requestOwnerId) return;

      if (!response.ok) {
        console.warn("[Interview] Nudge analysis failed:", response.statusText);
        return;
      }

      const data = await response.json();
      if (ownerIdRef.current !== requestOwnerId) return;

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

  const handleAgentStateChange = useCallback(
    (state: string) => {
      if (!connectionOwnerId || connectionOwnerId !== ownerIdRef.current) {
        return;
      }
      const normalizedState = state.toLowerCase();
      if (
        normalizedState === "idle" ||
        normalizedState === "listening" ||
        normalizedState === "thinking" ||
        normalizedState === "speaking"
      ) {
        setAgentState(normalizedState);
      }
    },
    [connectionOwnerId]
  );

  const refreshRoomCredentials = useCallback(async () => {
    if (
      !session ||
      !connectionOwnerId ||
      connectionOwnerId !== ownerIdRef.current ||
      deadlineReachedRef.current ||
      disconnectTimedOut ||
      credentialRequestInFlightRef.current ||
      Date.now() - lastCredentialRequestAtRef.current < 750
    ) {
      return;
    }
    const requestOwnerId = connectionOwnerId;

    credentialRequestInFlightRef.current = true;
    lastCredentialRequestAtRef.current = Date.now();
    const result = await requestInterviewRoomCredentialsWithRetry(
      session.id,
      session.livekit_room_name
    );
    credentialRequestInFlightRef.current = false;

    if (
      deadlineReachedRef.current ||
      ownerIdRef.current !== requestOwnerId ||
      connectionOwnerId !== requestOwnerId
    ) {
      return;
    }

    if (result.ok) {
      credentialRetryTimerRef.current = undefined;
      setToken(result.credentials.token);
      setUrl(result.credentials.url);
      setCredentialGeneration((generation) => generation + 1);
      return;
    }

    console.warn("[Interview] Reconnect credentials unavailable", {
      status: result.status,
      error: result.error,
    });
    if (shouldDiscardInterviewRoomCredentials(result.status)) {
      setToken("");
      setUrl("");
      setDisconnectTimedOut(true);
      setRecoveringConnection(false);
      setShowEndModal(false);
      setEndSessionError(null);
      setCurrentNudge(null);
      return;
    }

    if (result.retryAfterMs !== null) {
      credentialRetryTimerRef.current = window.setTimeout(() => {
        credentialRetryTimerRef.current = undefined;
        lastCredentialRequestAtRef.current = 0;
        refreshRoomCredentialsRef.current();
      }, result.retryAfterMs);
      return;
    }

    setError(
      result.message ||
        "We couldn't restore this interview. Please return to the dashboard."
    );
  }, [connectionOwnerId, disconnectTimedOut, session]);

  useEffect(() => {
    refreshRoomCredentialsRef.current = () => {
      void refreshRoomCredentials();
    };
  }, [refreshRoomCredentials]);

  const handleConnectionStateChange = useCallback(
    (state: InterviewConnectionStatus) => {
      if (!connectionOwnerId || connectionOwnerId !== ownerIdRef.current) {
        return;
      }
      if (recoveredStatusTimerRef.current !== undefined) {
        window.clearTimeout(recoveredStatusTimerRef.current);
        recoveredStatusTimerRef.current = undefined;
      }

      setConnectionStatus(state);
      if (state === "reconnecting" || state === "disconnected") {
        setRecoveringConnection(true);
        setCurrentNudge(null);
      }

      if (state === "disconnected") {
        void refreshRoomCredentials();
      }

      if (state === "connected") {
        if (credentialRetryTimerRef.current !== undefined) {
          window.clearTimeout(credentialRetryTimerRef.current);
          credentialRetryTimerRef.current = undefined;
        }
        setRecoveringConnection(false);
      }

      if (state === "recovered") {
        if (credentialRetryTimerRef.current !== undefined) {
          window.clearTimeout(credentialRetryTimerRef.current);
          credentialRetryTimerRef.current = undefined;
        }
        setRecoveringConnection(false);
        recoveredStatusTimerRef.current = window.setTimeout(() => {
          setConnectionStatus("connected");
          recoveredStatusTimerRef.current = undefined;
        }, 4_000);
      }
    },
    [connectionOwnerId, refreshRoomCredentials]
  );

  const handleDeadlineReached = useCallback(() => {
    if (!connectionOwnerId || connectionOwnerId !== ownerIdRef.current) {
      return;
    }
    if (deadlineReachedRef.current) return;
    deadlineReachedRef.current = true;
    setDeadlineReached(true);
    setShowEndModal(false);
    setEndSessionError(null);
    setCurrentNudge(null);
    setIsMuted(true);
    analytics.track("interview_deadline_reached", {
      session_id: activeSessionId,
      interview_type: session?.config?.roundType,
    });
  }, [activeSessionId, connectionOwnerId, session?.config?.roundType]);

  // The client only reflects the deadline. The server workflow owns completion
  // and room termination, including when this tab is hidden or killed.
  useEffect(() => {
    if ((!deadlineReached && !disconnectTimedOut) || !activeSessionId) return;

    let cancelled = false;
    let pollInFlight = false;
    let pollTimer: number | undefined;

    const pollTerminalTruth = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const response = await fetch(`/api/session/${activeSessionId}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            session?: {
              lifecycleState?: string | null;
              feedbackReady?: boolean;
            };
          };
          if (cancelled) return;
          if (
            payload.session?.lifecycleState &&
            TERMINAL_SESSION_STATES.has(payload.session.lifecycleState)
          ) {
            if (user?.id) {
              transcriptQueue.clearSession(user.id, activeSessionId);
            }
          }
          if (canNavigateToInterviewFeedback(payload.session ?? {})) {
            router.replace(`/feedback/${activeSessionId}/loading`);
            return;
          }
        }
      } catch (pollError) {
        console.warn("[Interview] Waiting for deadline completion:", pollError);
      } finally {
        pollInFlight = false;
      }

      if (!cancelled) {
        if (pollTimer !== undefined) window.clearTimeout(pollTimer);
        pollTimer = window.setTimeout(pollTerminalTruth, 1000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pollTimer !== undefined) window.clearTimeout(pollTimer);
        void pollTerminalTruth();
      }
    };

    void pollTerminalTruth();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeSessionId,
    deadlineReached,
    disconnectTimedOut,
    router,
    transcriptQueue,
    user?.id,
  ]);

  // A transport failure after transcript cutoff cannot prove whether the
  // idempotent end command committed. Freeze and disconnect the browser room,
  // then poll durable truth and occasionally retry the same command. There is
  // intentionally no resume or dismiss path while that ambiguity remains.
  useEffect(() => {
    if (!endReconciliation) return;

    let cancelled = false;
    let pollInFlight = false;
    let pollTimer: number | undefined;

    const pollEndReconciliation = async () => {
      if (pollInFlight || cancelled) return;
      if (ownerIdRef.current !== endReconciliation.ownerId) return;
      pollInFlight = true;
      const retryEnd = Date.now() >= nextEndRetryAtRef.current;
      const result = await reconcileAmbiguousInterviewEnd({
        sessionId: endReconciliation.sessionId,
        retryEnd,
      });
      pollInFlight = false;
      if (cancelled || ownerIdRef.current !== endReconciliation.ownerId) return;

      if (result.retryAttempted) {
        nextEndRetryAtRef.current = Date.now() + 10_000;
      }
      if (result.status === "resolved") {
        transcriptQueue.clearSession(
          endReconciliation.ownerId,
          endReconciliation.sessionId
        );
        analytics.track("interview_ended", {
          session_id: endReconciliation.sessionId,
          duration_seconds: endReconciliation.durationSeconds,
          ended_naturally: true,
          interview_type: session?.config?.roundType,
        });
        setEndReconciliation(null);
        router.replace(result.nextHref);
        return;
      }

      pollTimer = window.setTimeout(pollEndReconciliation, 1_000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pollTimer !== undefined) window.clearTimeout(pollTimer);
        void pollEndReconciliation();
      }
    };

    void pollEndReconciliation();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endReconciliation, router, session?.config?.roundType, transcriptQueue]);

  const handleEndSession = async () => {
    if (
      !activeSessionId ||
      !connectionOwnerId ||
      connectionOwnerId !== ownerIdRef.current
    ) {
      setError(
        "Missing interview session. Please return to the dashboard and try again."
      );
      return;
    }
    const requestOwnerId = connectionOwnerId;
    const requestSessionId = activeSessionId;

    setIsEndingSession(true);
    setEndSessionError(null);
    try {
      const transcriptSettlement = await establishTranscriptEndCutoff({
        setEndIntent: (value) => {
          endIntentRef.current = value;
        },
        flush: () =>
          transcriptQueue.flush(requestOwnerId, requestSessionId, 5_000),
      });
      if (ownerIdRef.current !== requestOwnerId) return;
      if (!transcriptSettlement.settled) {
        throw new Error(
          transcriptSettlement.failed > 0
            ? "We couldn't verify the complete transcript. You're still connected; please retry in a moment."
            : "We're still saving your latest response. You're still connected; please retry in a moment."
        );
      }
      const duration = sessionStartTime
        ? (Date.now() - sessionStartTime) / 1000
        : 0;

      let response: Response;
      try {
        response = await fetch("/api/interview/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: requestSessionId }),
        });
      } catch (transportError) {
        if (ownerIdRef.current !== requestOwnerId) return;
        console.warn(
          "[Interview] End transport result is ambiguous; reconciling stored truth",
          transportError
        );
        nextEndRetryAtRef.current = Date.now() + 1_000;
        setShowEndModal(false);
        setIsEndingSession(false);
        setEndSessionError(null);
        setEndReconciliation({
          ownerId: requestOwnerId,
          sessionId: requestSessionId,
          durationSeconds: duration,
        });
        return;
      }
      if (ownerIdRef.current !== requestOwnerId) return;
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        nextHref?: string;
      } | null;
      if (ownerIdRef.current !== requestOwnerId) return;

      if (!response.ok) {
        // A definitive server rejection means no terminal handoff occurred;
        // reopen packet acceptance before presenting the retry path. Network
        // ambiguity keeps the cutoff in place because the end may have committed.
        endIntentRef.current = false;
        throw new Error(
          data?.message ||
            "We couldn't end the interview yet. You're still connected and can try again."
        );
      }

      transcriptQueue.clearSession(requestOwnerId, requestSessionId);

      analytics.track("interview_ended", {
        session_id: requestSessionId,
        duration_seconds: duration,
        ended_naturally: true,
        interview_type: session?.config?.roundType,
      });

      setShowEndModal(false);
      setIsEndingSession(false);

      const nextHref = data?.nextHref?.startsWith(
        `/feedback/${requestSessionId}`
      )
        ? data.nextHref
        : `/feedback/${requestSessionId}/loading`;
      router.push(nextHref);
    } catch (error) {
      if (ownerIdRef.current !== requestOwnerId) return;
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

  if (endReconciliation && endReconciliation.ownerId === ownerIdRef.current) {
    return <EndReconciliationOverlay />;
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

  if (
    session &&
    hasCurrentConnectionOwner &&
    disconnectTimedOut &&
    (!token || !url)
  ) {
    return <ConnectionRecoveryOverlay status="timed_out" />;
  }

  if (
    session &&
    hasCurrentConnectionOwner &&
    recoveringConnection &&
    (!token || !url)
  ) {
    return <ConnectionRecoveryOverlay status="disconnected" />;
  }

  if (!session || !token || !url || !hasCurrentConnectionOwner) {
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
      credentialGeneration={credentialGeneration}
      onTranscriptUpdate={handleTranscriptUpdate}
      onAgentStateChange={handleAgentStateChange}
      onConnectionStateChange={handleConnectionStateChange}
    >
      <RoomAudioRenderer />
      <InterviewRoomContent
        session={session}
        transcript={transcript}
        agentState={agentState}
        isMuted={isMuted}
        hintMode={hintMode}
        transcriptSaveErrors={transcriptSaveErrors}
        deadlineReached={deadlineReached}
        connectionStatus={connectionStatus}
        recoveringConnection={recoveringConnection}
        onDeadlineReached={handleDeadlineReached}
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
        onEndSession={() => {
          if (!deadlineReached) setShowEndModal(true);
        }}
      />
      <NudgeOverlay
        nudge={deadlineReached ? null : currentNudge}
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
        isOpen={showEndModal && !deadlineReached}
        isLoading={isEndingSession}
        error={endSessionError}
        onClose={() => {
          setShowEndModal(false);
          setEndSessionError(null);
        }}
        onConfirm={handleEndSession}
      />
      {deadlineReached && <DeadlineReachedOverlay />}
      {!deadlineReached && disconnectTimedOut && (
        <ConnectionRecoveryOverlay status="timed_out" />
      )}
      {!deadlineReached && !disconnectTimedOut && recoveringConnection && (
        <ConnectionRecoveryOverlay status={connectionStatus} />
      )}
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
  deadlineReached: boolean;
  connectionStatus: InterviewConnectionStatus;
  recoveringConnection: boolean;
  onDeadlineReached: () => void;
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
  deadlineReached,
  connectionStatus,
  recoveringConnection,
  onDeadlineReached,
  onHintModeChange,
  onToggleMute,
  onEndSession,
}: InterviewRoomContentProps) {
  const { localParticipant } = useLocalParticipant();
  const connectionReady =
    connectionStatus === "connected" || connectionStatus === "recovered";

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(
        !isMuted && !deadlineReached && connectionReady
      );
    }
  }, [connectionReady, deadlineReached, isMuted, localParticipant]);

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
            {connectionStatus === "recovered" && (
              <StatusPill tone="success" aria-live="polite">
                Connection restored
              </StatusPill>
            )}
          </div>
          <TimerDisplay
            deadlineAt={session.deadline_at}
            onDeadlineReached={onDeadlineReached}
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
            {!deadlineReached && !recoveringConnection && connectionReady && (
              <InterviewControls
                isMuted={isMuted}
                hintMode={hintMode}
                onHintModeChange={onHintModeChange}
                onToggleMute={onToggleMute}
                onEndSession={onEndSession}
              />
            )}
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

function DeadlineReachedOverlay() {
  return (
    <div
      className="bg-overlay/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
    >
      <AppSurface
        variant="panel"
        size="lg"
        className="w-full max-w-md text-center shadow-xl"
      >
        <Loader2 className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
        <StatusPill tone="warning" className="mb-3">
          Time is up
        </StatusPill>
        <AppSurfaceTitle className="mb-2">
          Saving your interview
        </AppSurfaceTitle>
        <AppSurfaceDescription className="text-sm">
          We’re closing the room and finalizing the interview activity received
          so far before preparing feedback.
        </AppSurfaceDescription>
      </AppSurface>
    </div>
  );
}

export function EndReconciliationOverlay() {
  return (
    <div
      className="bg-overlay/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <AppSurface
        variant="panel"
        size="lg"
        className="w-full max-w-md text-center shadow-xl"
      >
        <Loader2 className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
        <StatusPill tone="warning" className="mb-3">
          Interview frozen
        </StatusPill>
        <AppSurfaceTitle className="mb-2">
          Confirming interview completion
        </AppSurfaceTitle>
        <AppSurfaceDescription className="text-sm">
          Your room is disconnected while we confirm the saved interview state
          and safely retry the same end request. Keep this page open. This
          interview cannot resume while the check is running.
        </AppSurfaceDescription>
      </AppSurface>
    </div>
  );
}

function ConnectionRecoveryOverlay({
  status,
}: {
  status: InterviewConnectionStatus | "timed_out";
}) {
  const timedOut = status === "timed_out";
  return (
    <div
      className="bg-overlay/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role="status"
      aria-live={timedOut ? "assertive" : "polite"}
    >
      <AppSurface
        variant="panel"
        size="lg"
        className="w-full max-w-md text-center shadow-xl"
      >
        {timedOut ? (
          <WifiOff className="text-muted-foreground mx-auto mb-4 h-8 w-8" />
        ) : (
          <Loader2 className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
        )}
        <StatusPill tone={timedOut ? "warning" : "primary"} className="mb-3">
          {timedOut ? "Connection ended" : "Reconnecting"}
        </StatusPill>
        <AppSurfaceTitle className="mb-2">
          {timedOut ? "Closing your interview" : "Restoring your interview"}
        </AppSurfaceTitle>
        <AppSurfaceDescription className="text-sm">
          {timedOut
            ? "The reconnect window ended. We’re closing this interview once and preparing the available feedback. Keep this page open."
            : "Keep this page open. Your interview and saved transcript stay in place while we restore the connection."}
        </AppSurfaceDescription>
      </AppSurface>
    </div>
  );
}

async function requestInterviewRoomCredentialsWithRetry(
  sessionId: string,
  expectedRoomName: string
): Promise<RoomCredentialResult> {
  const maxAttempts = 3;
  let lastFailure: RoomCredentialFailure = {
    ok: false,
    status: 503,
    error: "connection_unavailable",
    message: "Reconnect authorization is temporarily unavailable.",
    retryAfterMs: 2_000,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const credentials = parseInterviewRoomCredentials(
          payload,
          expectedRoomName
        );
        if (credentials) {
          const lifecycleResponse = await fetch(`/api/session/${sessionId}`, {
            cache: "no-store",
          });
          const lifecyclePayload = await lifecycleResponse
            .json()
            .catch(() => null);
          if (
            lifecycleResponse.ok &&
            isRecord(lifecyclePayload) &&
            isInterviewRoomCredentialAuthorizationCurrent(
              credentials,
              lifecyclePayload.session
            )
          ) {
            return { ok: true, credentials };
          }
          return {
            ok: false,
            status: 409,
            error: "session_not_joinable",
            message: "This interview session is no longer active.",
            retryAfterMs: null,
          };
        }

        return {
          ok: false,
          status: 502,
          error: "invalid_room_credentials",
          message: "The interview room response was invalid.",
          retryAfterMs: null,
        };
      }

      const retryAfterMs = getCredentialRetryDelayMs(
        response.status,
        response.headers.get("Retry-After")
      );
      lastFailure = {
        ok: false,
        status: response.status,
        error:
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "connection_unavailable",
        message:
          isRecord(payload) && typeof payload.message === "string"
            ? payload.message
            : undefined,
        retryAfterMs,
      };
    } catch (credentialError) {
      console.warn(
        "[Interview] Failed to request reconnect credentials",
        credentialError
      );
      lastFailure = {
        ok: false,
        status: 503,
        error: "connection_unavailable",
        message: "Reconnect authorization is temporarily unavailable.",
        retryAfterMs: 2_000,
      };
    }

    if (
      !lastFailure.ok &&
      lastFailure.retryAfterMs !== null &&
      attempt < maxAttempts - 1
    ) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, lastFailure.retryAfterMs!)
      );
      continue;
    }

    return lastFailure;
  }

  return lastFailure;
}

function normalizePersistedSession(
  session: PersistedInterviewSession
): InterviewSession {
  const timing = requireInterviewResumeTiming(session);
  const config = session.config || {};
  return {
    id: session.id,
    livekit_room_name: session.livekitRoomName || "",
    started_at: timing.startedAt,
    deadline_at: timing.deadlineAt,
    lifecycle_state: session.lifecycleState,
    config: {
      ...config,
      roundType: session.roundType || config.roundType || undefined,
      mode: session.mode || config.mode || undefined,
      difficulty: config.difficulty || undefined,
    },
    question: null,
  };
}

function isHintMode(value: unknown): value is HintMode {
  return value === "off" || value === "gentle" || value === "coach";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

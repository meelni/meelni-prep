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
import { groupTranscriptTurns } from "./components/transcript-display";
import { AudioVisualizer } from "./components/audio-visualizer";
import { InterviewControls } from "./components/interview-controls";
import { TimerDisplay } from "./components/timer-display";
import { EndSessionModal } from "./components/end-session-modal";
import { ConnectionIndicator } from "./components/connection-indicator";
import { InterviewRoomSurface } from "./components/interview-room-surface";
import { useLocalParticipant } from "@livekit/components-react";
import { RoomAudioRenderer } from "@livekit/components-react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { requireInterviewResumeTiming } from "@/lib/interview/resume-session";
import { compareTranscriptOrdering } from "@/lib/workflows/ingest-transcript-event";
import { canNavigateToInterviewFeedback } from "@/lib/interview/deadline-view";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  getCanonicalInterviewHref,
  getCredentialRetryDelayMs,
  isInterviewRoomCredentialAuthorizationCurrent,
  parseInterviewRoomCredentials,
  shouldDiscardInterviewRoomCredentials,
  type InterviewConnectionStatus,
  type InterviewRoomCredentials,
} from "@/components/interview/session-recovery";
import { buildNewInterviewHref } from "@/lib/navigation/interview-launch";
import { reconcileAmbiguousInterviewEnd } from "@/lib/interview/end-reconciliation";
import { consumeInitialInterviewRoomCredentials } from "@/lib/interview/room-credential-handoff";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { fetchWithDeadline } from "@/lib/http/deadline";

const TERMINAL_SESSION_STATES = new Set(["completed", "abandoned", "failed"]);
const END_INTERVIEW_ACCEPTANCE_TIMEOUT_MS = 5_000;

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

  // Session info (after session is created)
  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const endSessionReturnFocusRef = useRef<HTMLElement | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const endIntentRef = useRef(false);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptIntegrity, setTranscriptIntegrity] = useState<
    "healthy" | "retrying" | "degraded"
  >("healthy");
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
  const [transcriptHydrationGeneration, setTranscriptHydrationGeneration] =
    useState(0);
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
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const hasCurrentConnectionOwner =
    connectionOwnerId !== null && connectionOwnerId === ownerIdRef.current;

  useEffect(() => {
    const nextOwnerId = user?.id ?? null;
    const previousOwnerId = observedOwnerIdRef.current;
    observedOwnerIdRef.current = nextOwnerId;

    if (previousOwnerId === undefined) return;
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

    setConnectionOwnerId(null);
    setSession(null);
    setToken("");
    setUrl("");
    setTranscript([]);
    setIsMuted(false);
    setTranscriptIntegrity("healthy");
    setAgentState("idle");
    setSessionStartTime(null);
    setDeadlineReached(false);
    setConnectionStatus("connecting");
    setRecoveringConnection(false);
    setDisconnectTimedOut(false);
    setCredentialGeneration(0);
    setTranscriptHydrationGeneration(0);
    setShowEndModal(false);
    setIsEndingSession(false);
    setEndSessionError(null);
    setEndReconciliation(null);
    setError(null);
    setLoading(false);

    router.replace(
      nextOwnerId ? "/dashboard" : "/auth/signin?redirectTo=/interview"
    );
  }, [router, user?.id]);

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

      const initialCredentials = consumeInitialInterviewRoomCredentials({
        sessionId,
        ownerId: requestOwnerId,
        expectedRoomName: normalizedSession.livekit_room_name,
      });
      if (initialCredentials) {
        setToken(initialCredentials.token);
        setUrl(initialCredentials.url);
        setConnectionOwnerId(requestOwnerId);
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
          setError(
            credentialResult.message ||
              "This interview could not be opened safely. Please return to the dashboard and try again."
          );
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
      console.error("[Interview] session_fetch_failed", {
        code: "interview_session_fetch_failed",
        ...toSafeErrorLog(err),
      });
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    }
  }, [router, sessionId, user]);

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current || ownerTransitionInProgressRef.current) return;

    // Session creation has one canonical owner. Old bookmarked launch URLs are
    // forwarded to setup so they cannot construct a divergent start intent.
    if (!sessionId) {
      initializedRef.current = true;
      router.replace(buildNewInterviewHref(searchParams.toString()));
      return;
    }

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

    fetchSessionDetails();
    initializedRef.current = true;
  }, [authLoading, fetchSessionDetails, router, searchParams, sessionId, user]);

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

    if (turn.persistable === false) {
      console.warn(
        "[Interview] Displaying legacy transcript packet without invented persistence timing"
      );
    } else if (!turn.event) {
      console.warn(
        "[Interview] Ignoring transcript turn without a canonical event"
      );
      return;
    } else if (turn.event.session_id !== callbackSessionId) {
      console.warn(
        "[Interview] Ignoring transcript turn for a stale or mismatched session"
      );
      return;
    }

    // Runtime packets are post-persistence display notifications. The LiveKit
    // adapter rejects replayed identities before this callback, so the browser
    // renders each accepted turn once without owning a second write path.
    setTranscript((prev) => mergeTranscriptTurns(prev, [turn]));
  };

  useEffect(() => {
    if (
      !activeSessionId ||
      !connectionOwnerId ||
      connectionOwnerId !== ownerIdRef.current
    ) {
      return;
    }
    const requestOwnerId = connectionOwnerId;
    const requestSessionId = activeSessionId;
    let cancelled = false;
    const controller = new AbortController();

    const hydrateDurableTranscript = async () => {
      try {
        const response = await fetchWithDeadline(
          `/api/session/${requestSessionId}/transcript`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          turns?: Array<{
            id: string;
            eventId?: string | null;
            writerId?: string | null;
            writerGeneration?: number | null;
            sequence?: number | null;
            sessionId: string;
            roomName?: string | null;
            speaker: "user" | "interviewer";
            text?: string | null;
            startedAt?: string | null;
            endedAt?: string | null;
            audioMs?: number | null;
            section?: string | null;
            deliveryState?: "delivered" | "partially_delivered" | null;
          }>;
        };
        if (
          cancelled ||
          ownerIdRef.current !== requestOwnerId ||
          activeSessionIdRef.current !== requestSessionId
        ) {
          return;
        }
        const hydrated = (payload.turns ?? []).flatMap((turn) => {
          if (!turn.text || !turn.startedAt) return [];
          return [
            {
              persistable: Boolean(turn.eventId),
              eventId: turn.eventId ?? turn.id,
              rowId: turn.id,
              writerId: turn.writerId ?? undefined,
              writerGeneration: turn.writerGeneration ?? undefined,
              sequence: turn.sequence ?? undefined,
              sessionId: turn.sessionId,
              roomName: turn.roomName ?? undefined,
              speaker: turn.speaker,
              text: turn.text,
              timestamp: new Date(turn.startedAt),
              startedAt: new Date(turn.startedAt),
              endedAt: turn.endedAt ? new Date(turn.endedAt) : undefined,
              audioMs: turn.audioMs ?? undefined,
              section: turn.section ?? undefined,
              deliveryState: turn.deliveryState ?? undefined,
            } satisfies TranscriptTurn,
          ];
        });
        setTranscript((current) => mergeTranscriptTurns(current, hydrated));
      } catch (hydrateError) {
        if (
          cancelled ||
          ownerIdRef.current !== requestOwnerId ||
          activeSessionIdRef.current !== requestSessionId
        ) {
          return;
        }
        console.warn("[Interview] Durable transcript hydration failed", {
          sessionId: requestSessionId,
          error:
            hydrateError instanceof Error
              ? hydrateError.name
              : "unknown_hydration_error",
        });
      }
    };

    // Runtime packets are the normal post-persistence display path. Hydrate
    // once after authorization and resync only after a real connection
    // recovery; turn-state churn must never fan out full transcript reads.
    void hydrateDurableTranscript();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeSessionId, connectionOwnerId, transcriptHydrationGeneration]);

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
        setTranscriptHydrationGeneration((generation) => generation + 1);
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
          if (canNavigateToInterviewFeedback(payload.session ?? {})) {
            router.replace(`/feedback/${activeSessionId}/loading`);
            return;
          }
        }
      } catch (pollError) {
        console.warn("[Interview] deadline_poll_failed", {
          code: "deadline_poll_failed",
          ...toSafeErrorLog(pollError),
        });
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
  }, [activeSessionId, deadlineReached, disconnectTimedOut, router]);

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
  }, [endReconciliation, router, session?.config?.roundType]);

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

    // Explicit end is a terminal intent. Freeze browser-side evidence and mute
    // immediately; the server owns bounded runtime settlement and durable
    // finalization from this point forward.
    endIntentRef.current = true;
    setIsMuted(true);
    setIsEndingSession(true);
    setEndSessionError(null);
    setTranscriptIntegrity("retrying");
    try {
      const duration = sessionStartTime
        ? (Date.now() - sessionStartTime) / 1000
        : 0;

      let response: Response;
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        END_INTERVIEW_ACCEPTANCE_TIMEOUT_MS
      );
      try {
        response = await fetch("/api/interview/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: requestSessionId }),
          signal: controller.signal,
        });
      } catch (transportError) {
        if (ownerIdRef.current !== requestOwnerId) return;
        console.warn("[Interview] end_transport_ambiguous", {
          code: "interview_end_transport_ambiguous",
          ...toSafeErrorLog(transportError),
        });
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
      } finally {
        window.clearTimeout(timeout);
      }
      if (ownerIdRef.current !== requestOwnerId) return;
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        nextHref?: string;
      } | null;
      if (ownerIdRef.current !== requestOwnerId) return;

      if (!response.ok) {
        setTranscriptIntegrity("degraded");
        throw new Error(
          data?.message ||
            "Your interview is paused, but we couldn't confirm completion yet. Please try End Interview again."
        );
      }

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
      console.error("[Interview] session_end_failed", {
        code: "session_end_failed",
        ...toSafeErrorLog(error),
      });
      setEndSessionError(
        error instanceof Error
          ? error.message
          : "Your interview is paused, but we couldn't confirm completion yet. Please try End Interview again."
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
      onTranscriptIntegrityChange={setTranscriptIntegrity}
    >
      <RoomAudioRenderer />
      <InterviewRoomContent
        session={session}
        transcript={transcript}
        agentState={agentState}
        isMuted={isMuted}
        transcriptIntegrity={transcriptIntegrity}
        deadlineReached={deadlineReached}
        connectionStatus={connectionStatus}
        recoveringConnection={recoveringConnection}
        onDeadlineReached={handleDeadlineReached}
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
          if (!deadlineReached) {
            endSessionReturnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            setShowEndModal(true);
          }
        }}
      />
      <EndSessionModal
        isOpen={showEndModal && !deadlineReached}
        isLoading={isEndingSession}
        error={endSessionError}
        capturedAnswerCount={
          groupTranscriptTurns(transcript).filter(
            (turn) => turn.speaker === "user" && turn.text.trim().length > 0
          ).length
        }
        terminalIntent={endSessionError !== null}
        onClose={() => {
          setShowEndModal(false);
          setEndSessionError(null);
        }}
        onConfirm={handleEndSession}
        returnFocusRef={endSessionReturnFocusRef}
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
  transcriptIntegrity: "healthy" | "retrying" | "degraded";
  deadlineReached: boolean;
  connectionStatus: InterviewConnectionStatus;
  recoveringConnection: boolean;
  onDeadlineReached: () => void;
  onToggleMute: () => void;
  onEndSession: () => void;
}

function InterviewRoomContent({
  session,
  transcript,
  agentState,
  isMuted,
  transcriptIntegrity,
  deadlineReached,
  connectionStatus,
  recoveringConnection,
  onDeadlineReached,
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

  return (
    <InterviewRoomSurface
      company={session.question?.company}
      connectionIndicator={<ConnectionIndicator />}
      connectionStatus={connectionStatus}
      controls={
        <InterviewControls
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onEndSession={onEndSession}
        />
      }
      deadlineReached={deadlineReached}
      mediaVisualizer={<AudioVisualizer agentState={agentState} />}
      question={session.question?.text}
      recoveringConnection={recoveringConnection}
      roundType={session.config?.roundType}
      timer={
        <TimerDisplay
          deadlineAt={session.deadline_at}
          onDeadlineReached={onDeadlineReached}
        />
      }
      transcriptIntegrity={transcriptIntegrity}
      transcriptPanel={<TranscriptPanel turns={transcript} />}
    />
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
          and safely retry the same end request. You may leave this page; the
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
      console.warn("[Interview] reconnect_credentials_failed", {
        code: "reconnect_credentials_failed",
        ...toSafeErrorLog(credentialError),
      });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeTranscriptTurns(
  current: TranscriptTurn[],
  incoming: TranscriptTurn[]
): TranscriptTurn[] {
  const turns = new Map<string, TranscriptTurn>();
  for (const turn of [...current, ...incoming]) {
    const key = turn.eventId
      ? `event:${turn.eventId}`
      : turn.rowId
        ? `row:${turn.rowId}`
        : `legacy:${turn.speaker}:${turn.timestamp.toISOString()}:${turn.text}`;
    turns.set(key, turn);
  }
  return [...turns.values()].sort(compareTranscriptOrdering);
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

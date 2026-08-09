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
import { useAcknowledgedMicrophone } from "@/components/interview/use-acknowledged-microphone";
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
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
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
  getInterviewRetryDelayMs,
  isInterviewConversationReady,
  classifyInterviewSessionBootstrapResponse,
  parseInterviewRoomCredentials,
  shouldDiscardInterviewRoomCredentials,
  waitForInterviewRecoveryDelay,
  type InterviewConnectionStatus,
  type InterviewRoomCredentials,
} from "@/components/interview/session-recovery";
import { buildNewInterviewHref } from "@/lib/navigation/interview-launch";
import { reconcileAmbiguousInterviewEnd } from "@/lib/interview/end-reconciliation";
import { consumeInitialInterviewRoomCredentials } from "@/lib/interview/room-credential-handoff";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import {
  CUSTOMER_CLIENT_FETCH_DEADLINE_MS,
  fetchWithDeadline,
} from "@/lib/http/deadline";
import { INTERVIEW_START_SLOS } from "@/lib/operations/interview-start-slo";
import { runBoundedSequentialTerminalPoll } from "@/lib/interview/terminal-poll-window";
import {
  classifyTranscriptHydrationResponse,
  getTranscriptHydrationRetryDelayMs,
  TRANSCRIPT_HYDRATION_MAX_ATTEMPTS,
  waitForTranscriptHydrationRetry,
  type DurableTranscriptHydrationState,
} from "@/lib/interview/transcript-hydration";

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
  question?: {
    id: string;
    text: string;
    company: string | null;
  } | null;
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
  | RoomCredentialFailure
  | { ok: false; aborted: true };

type SessionBootstrapResult =
  | { disposition: "ready"; payload: unknown }
  | {
      disposition: "terminal";
      status: number;
      message?: string;
    }
  | { disposition: "retryable_exhausted" }
  | { disposition: "aborted" };

interface EndReconciliationState {
  ownerId: string;
  sessionId: string;
  durationSeconds: number;
}

type TerminalPollPresentationState = "checking" | "paused";

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
  const [microphoneSessionActive, setMicrophoneSessionActive] = useState(true);
  const [microphoneActivatedSessionId, setMicrophoneActivatedSessionId] =
    useState<string | null>(null);
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
  const [transcriptHydrationState, setTranscriptHydrationState] =
    useState<DurableTranscriptHydrationState>("loading");
  const [agentState, setAgentState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [deadlineReached, setDeadlineReached] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<InterviewConnectionStatus>("connecting");
  const [recoveringConnection, setRecoveringConnection] = useState(false);
  const [disconnectTimedOut, setDisconnectTimedOut] = useState(false);
  const [bootstrapRetryAvailable, setBootstrapRetryAvailable] = useState(false);
  const [credentialRetryAvailable, setCredentialRetryAvailable] =
    useState(false);
  const [credentialGeneration, setCredentialGeneration] = useState(0);
  const [connectionOwnerId, setConnectionOwnerId] = useState<string | null>(
    null
  );
  const [transcriptHydrationGeneration, setTranscriptHydrationGeneration] =
    useState(0);
  const [endReconciliation, setEndReconciliation] =
    useState<EndReconciliationState | null>(null);
  const [terminalPollGeneration, setTerminalPollGeneration] = useState(0);
  const [terminalPollStatus, setTerminalPollStatus] =
    useState<TerminalPollPresentationState>("checking");
  const [endPollGeneration, setEndPollGeneration] = useState(0);
  const [endPollStatus, setEndPollStatus] =
    useState<TerminalPollPresentationState>("checking");
  const initializedRef = useRef(false);
  const deadlineReachedRef = useRef(false);
  const credentialRequestInFlightRef = useRef(false);
  const lastCredentialRequestAtRef = useRef(0);
  const recoveredStatusTimerRef = useRef<number | undefined>(undefined);
  const refreshRoomCredentialsRef = useRef<() => void>(() => undefined);
  const bootstrapControllerRef = useRef<AbortController | null>(null);
  const credentialControllerRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const transcriptHydrationKeyRef = useRef<string | null>(null);
  const transcriptHydrationInFlightRef = useRef<{
    key: string;
    token: symbol;
    controller: AbortController;
  } | null>(null);
  const observedOwnerIdRef = useRef<string | null | undefined>(undefined);
  const ownerTransitionInProgressRef = useRef(false);
  const ownerIdRef = useRef<string | null>(user?.id ?? null);
  const routerRef = useRef(router);
  const nextEndRetryAtRef = useRef(0);
  const terminalNavigationStartedRef = useRef(false);
  const terminalPollActiveRef = useRef(false);
  const terminalPollWindowIdRef = useRef(0);
  const endPollActiveRef = useRef(false);
  const endPollWindowIdRef = useRef(0);
  ownerIdRef.current = user?.id ?? null;
  routerRef.current = router;
  const activeSessionId = session?.id ?? sessionId ?? "";
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const hasCurrentConnectionOwner =
    connectionOwnerId !== null && connectionOwnerId === ownerIdRef.current;

  const abortBootstrapWork = useCallback((reason: string) => {
    bootstrapControllerRef.current?.abort(reason);
    bootstrapControllerRef.current = null;
  }, []);

  const abortCredentialWork = useCallback((reason: string) => {
    credentialControllerRef.current?.abort(reason);
    credentialControllerRef.current = null;
    credentialRequestInFlightRef.current = false;
  }, []);

  const replaceTerminalDestination = useCallback((href: string) => {
    if (terminalNavigationStartedRef.current) return false;
    terminalNavigationStartedRef.current = true;
    routerRef.current.replace(href);
    return true;
  }, []);

  const leaveForInterviewHistory = useCallback(() => {
    if (terminalNavigationStartedRef.current) return;
    terminalNavigationStartedRef.current = true;
    routerRef.current.replace("/dashboard/history");
  }, []);

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
    abortBootstrapWork("interview_owner_changed");
    abortCredentialWork("interview_owner_changed");
    lastCredentialRequestAtRef.current = 0;
    initializedRef.current = false;
    ownerTransitionInProgressRef.current = true;
    deadlineReachedRef.current = false;
    endIntentRef.current = false;
    nextEndRetryAtRef.current = 0;
    terminalNavigationStartedRef.current = false;
    terminalPollActiveRef.current = false;
    terminalPollWindowIdRef.current += 1;
    endPollActiveRef.current = false;
    endPollWindowIdRef.current += 1;

    setConnectionOwnerId(null);
    setSession(null);
    setToken("");
    setUrl("");
    setTranscript([]);
    transcriptRef.current = [];
    setMicrophoneSessionActive(true);
    setMicrophoneActivatedSessionId(null);
    setTranscriptIntegrity("healthy");
    setTranscriptHydrationState("loading");
    setAgentState("idle");
    setSessionStartTime(null);
    setDeadlineReached(false);
    setConnectionStatus("connecting");
    setRecoveringConnection(false);
    setDisconnectTimedOut(false);
    setBootstrapRetryAvailable(false);
    setCredentialRetryAvailable(false);
    setCredentialGeneration(0);
    setTranscriptHydrationGeneration(0);
    transcriptHydrationKeyRef.current = null;
    transcriptHydrationInFlightRef.current?.controller.abort();
    transcriptHydrationInFlightRef.current = null;
    setShowEndModal(false);
    setIsEndingSession(false);
    setEndSessionError(null);
    setEndReconciliation(null);
    setTerminalPollGeneration(0);
    setTerminalPollStatus("checking");
    setEndPollGeneration(0);
    setEndPollStatus("checking");
    setError(null);
    setLoading(false);

    router.replace(
      nextOwnerId ? "/dashboard" : "/auth/signin?redirectTo=/interview"
    );
  }, [abortBootstrapWork, abortCredentialWork, router, user?.id]);

  // Invalidate queries when component unmounts (user leaves interview)
  useEffect(() => {
    return () => {
      if (recoveredStatusTimerRef.current !== undefined) {
        window.clearTimeout(recoveredStatusTimerRef.current);
      }
      abortBootstrapWork("interview_page_unmounted");
      abortCredentialWork("interview_page_unmounted");
      console.log("Interview page unmounting, invalidating sessions queries");
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    };
  }, [abortBootstrapWork, abortCredentialWork, queryClient]);

  const fetchSessionDetails = useCallback(async () => {
    if (!sessionId || !user) return;
    const requestOwnerId = user.id;
    abortBootstrapWork("interview_bootstrap_superseded");
    const bootstrapController = new AbortController();
    bootstrapControllerRef.current = bootstrapController;

    try {
      setLoading(true);
      setError(null);
      setBootstrapRetryAvailable(false);
      const bootstrap = await requestInterviewSessionWithRetry(
        sessionId,
        bootstrapController.signal
      );
      if (
        bootstrap.disposition === "aborted" ||
        bootstrapController.signal.aborted ||
        ownerIdRef.current !== requestOwnerId
      ) {
        return;
      }
      if (bootstrap.disposition === "retryable_exhausted") {
        setBootstrapRetryAvailable(true);
        setLoading(false);
        return;
      }
      if (bootstrap.disposition === "terminal") {
        if (bootstrap.status === 401) {
          router.replace("/auth/signin?redirectTo=/interview");
          return;
        }
        if (bootstrap.status === 403 || bootstrap.status === 404) {
          router.replace("/dashboard");
          return;
        }
        setError(
          bootstrap.message ||
            "This interview could not be opened safely. Please return to the dashboard."
        );
        setLoading(false);
        return;
      }
      if (!isRecord(bootstrap.payload) || !bootstrap.payload.session) {
        throw new Error("The interview session response was invalid.");
      }
      const sessionData = bootstrap.payload
        .session as unknown as PersistedInterviewSession;
      const normalizedSession = normalizePersistedSession(sessionData);

      if (
        canNavigateToInterviewFeedback({
          lifecycleState: normalizedSession.lifecycle_state,
        })
      ) {
        replaceTerminalDestination(`/feedback/${sessionId}/loading`);
        return;
      }

      setSession(normalizedSession);
      // The authenticated session read establishes ownership before LiveKit
      // credentials exist. Keep the server-owned End command reachable while
      // the provider handoff is still pending.
      setConnectionOwnerId(requestOwnerId);
      setSessionStartTime(new Date(normalizedSession.started_at).getTime());

      const initialCredentials = consumeInitialInterviewRoomCredentials({
        sessionId,
        ownerId: requestOwnerId,
        expectedRoomName: normalizedSession.livekit_room_name,
      });
      if (initialCredentials) {
        setToken(initialCredentials.token);
        setUrl(initialCredentials.url);
        setCredentialRetryAvailable(false);
        setLoading(false);
        return;
      }

      abortCredentialWork("interview_credentials_superseded");
      const credentialController = new AbortController();
      credentialControllerRef.current = credentialController;
      credentialRequestInFlightRef.current = true;
      const credentialResult = await requestInterviewRoomCredentialsWithRetry(
        sessionId,
        normalizedSession.livekit_room_name,
        credentialController.signal
      );
      if (credentialControllerRef.current === credentialController) {
        credentialControllerRef.current = null;
        credentialRequestInFlightRef.current = false;
      }
      if (ownerIdRef.current !== requestOwnerId) return;
      if (endIntentRef.current) return;
      if ("aborted" in credentialResult) return;
      if (!credentialResult.ok) {
        if (shouldDiscardInterviewRoomCredentials(credentialResult.status)) {
          setToken("");
          setUrl("");
          if (credentialResult.status === 401) {
            router.replace("/auth/signin?redirectTo=/interview");
            return;
          }
          if (
            credentialResult.status === 403 ||
            credentialResult.status === 404
          ) {
            router.replace("/dashboard");
            return;
          }
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
          setCredentialRetryAvailable(true);
          setLoading(false);
          return;
        }
        throw new Error(
          credentialResult.message ||
            "We couldn't reconnect to this interview. Please try again."
        );
      }

      setToken(credentialResult.credentials.token);
      setUrl(credentialResult.credentials.url);
      setCredentialRetryAvailable(false);
      setLoading(false);
    } catch (err) {
      if (
        bootstrapController.signal.aborted ||
        ownerIdRef.current !== requestOwnerId
      ) {
        return;
      }
      console.error("[Interview] session_fetch_failed", {
        code: "interview_session_fetch_failed",
        ...toSafeErrorLog(err),
      });
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    } finally {
      if (bootstrapControllerRef.current === bootstrapController) {
        bootstrapControllerRef.current = null;
      }
    }
  }, [
    abortBootstrapWork,
    abortCredentialWork,
    replaceTerminalDestination,
    router,
    sessionId,
    user,
  ]);

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
    transcriptRef.current = mergeTranscriptTurns(transcriptRef.current, [turn]);
    setTranscript((current) => mergeTranscriptTurns(current, [turn]));
    setTranscriptHydrationState((current) =>
      current === "empty" ? "ready" : current
    );
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
    const hydrationKey = `${requestOwnerId}:${requestSessionId}`;
    const existingRequest = transcriptHydrationInFlightRef.current;
    if (existingRequest?.key === hydrationKey) return;
    existingRequest?.controller.abort();

    const previousHydrationKey = transcriptHydrationKeyRef.current;
    const isNewOwnerSession = previousHydrationKey !== hydrationKey;
    transcriptHydrationKeyRef.current = hydrationKey;
    if (previousHydrationKey !== null && isNewOwnerSession) {
      transcriptRef.current = [];
      setTranscript([]);
    }
    setTranscriptHydrationState(isNewOwnerSession ? "loading" : "retrying");

    const controller = new AbortController();
    const requestToken = Symbol(hydrationKey);
    transcriptHydrationInFlightRef.current = {
      key: hydrationKey,
      token: requestToken,
      controller,
    };

    const requestIsCurrent = () =>
      transcriptHydrationInFlightRef.current?.token === requestToken &&
      !controller.signal.aborted &&
      ownerIdRef.current === requestOwnerId &&
      activeSessionIdRef.current === requestSessionId;

    const hydrateDurableTranscript = async () => {
      let lastFailureReason: string | null = null;

      for (
        let attempt = 0;
        attempt < TRANSCRIPT_HYDRATION_MAX_ATTEMPTS;
        attempt += 1
      ) {
        let response: Response | null = null;
        let failureReason: string | null = null;

        try {
          response = await fetchWithDeadline(
            `/api/session/${requestSessionId}/transcript`,
            { cache: "no-store", signal: controller.signal }
          );
        } catch (hydrateError) {
          if (!requestIsCurrent()) return;
          failureReason =
            hydrateError instanceof Error && hydrateError.name === "AbortError"
              ? "timeout"
              : "transport";
        }

        if (!requestIsCurrent()) return;

        let disposition = response
          ? classifyTranscriptHydrationResponse(response.status)
          : "retryable";
        if (disposition === "authorization_lost") {
          console.warn("[Interview] transcript_hydration_authority_lost", {
            code: "transcript_hydration_authority_lost",
            status: response?.status ?? 0,
          });
          setToken("");
          setUrl("");
          setSession(null);
          setConnectionOwnerId(null);
          setTranscript([]);
          transcriptRef.current = [];
          setTranscriptHydrationState("loading");
          routerRef.current.replace(
            response?.status === 401
              ? "/auth/signin?redirectTo=/interview"
              : "/dashboard"
          );
          return;
        }

        if (response?.ok) {
          const payload: unknown = await response.json().catch(() => null);
          if (!requestIsCurrent()) return;

          const hydrated = normalizeHydratedTranscriptPayload(
            payload,
            requestSessionId
          );
          if (hydrated !== null) {
            const mergedAtResponse = mergeTranscriptTurns(
              transcriptRef.current,
              hydrated
            );
            transcriptRef.current = mergedAtResponse;
            setTranscript((current) => mergeTranscriptTurns(current, hydrated));
            setTranscriptHydrationState(
              mergedAtResponse.length === 0 ? "empty" : "ready"
            );
            if (lastFailureReason !== null) {
              console.info("[Interview] transcript_hydration_recovered", {
                code: "transcript_hydration_recovered",
                reason: lastFailureReason,
                attempts: attempt + 1,
              });
            }
            return;
          }
          disposition = "retryable";
          failureReason = "invalid_payload";
        }

        failureReason =
          failureReason ?? `http_${String(response?.status ?? 0)}`;
        lastFailureReason = failureReason;
        console.warn("[Interview] transcript_hydration_retry", {
          code: "transcript_hydration_retry",
          reason: failureReason,
          attempt: attempt + 1,
        });

        const canRetry =
          disposition === "retryable" &&
          attempt < TRANSCRIPT_HYDRATION_MAX_ATTEMPTS - 1;
        if (!canRetry) {
          setTranscriptHydrationState("degraded");
          return;
        }

        setTranscriptHydrationState("retrying");
        try {
          await waitForTranscriptHydrationRetry(
            getTranscriptHydrationRetryDelayMs(response, attempt),
            controller.signal
          );
        } catch {
          return;
        }
      }
    };

    // Runtime packets are the normal post-persistence display path. Hydrate
    // once after authorization and resync only after a real connection
    // recovery; turn-state churn must never fan out full transcript reads.
    void hydrateDurableTranscript().finally(() => {
      if (transcriptHydrationInFlightRef.current?.token === requestToken) {
        transcriptHydrationInFlightRef.current = null;
      }
    });
    return () => {
      controller.abort();
      if (transcriptHydrationInFlightRef.current?.token === requestToken) {
        transcriptHydrationInFlightRef.current = null;
      }
    };
  }, [activeSessionId, connectionOwnerId, transcriptHydrationGeneration]);

  const retryTranscriptHydration = useCallback(() => {
    if (
      !activeSessionIdRef.current ||
      !connectionOwnerId ||
      connectionOwnerId !== ownerIdRef.current ||
      transcriptHydrationInFlightRef.current !== null
    ) {
      return;
    }
    setTranscriptHydrationState("retrying");
    setTranscriptHydrationGeneration((generation) => generation + 1);
  }, [connectionOwnerId]);

  useEffect(() => {
    if (transcriptHydrationState !== "degraded") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        retryTranscriptHydration();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [retryTranscriptHydration, transcriptHydrationState]);

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
      endIntentRef.current ||
      disconnectTimedOut ||
      credentialRequestInFlightRef.current ||
      Date.now() - lastCredentialRequestAtRef.current < 750
    ) {
      return;
    }
    const requestOwnerId = connectionOwnerId;

    credentialRequestInFlightRef.current = true;
    lastCredentialRequestAtRef.current = Date.now();
    setCredentialRetryAvailable(false);
    const credentialController = new AbortController();
    credentialControllerRef.current = credentialController;
    const result = await requestInterviewRoomCredentialsWithRetry(
      session.id,
      session.livekit_room_name,
      credentialController.signal
    );
    if (credentialControllerRef.current === credentialController) {
      credentialControllerRef.current = null;
      credentialRequestInFlightRef.current = false;
    }

    if (
      "aborted" in result ||
      deadlineReachedRef.current ||
      endIntentRef.current ||
      ownerIdRef.current !== requestOwnerId ||
      connectionOwnerId !== requestOwnerId
    ) {
      return;
    }

    if (result.ok) {
      setToken(result.credentials.token);
      setUrl(result.credentials.url);
      setCredentialRetryAvailable(false);
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
      if (result.status === 401) {
        router.replace("/auth/signin?redirectTo=/interview");
        return;
      }
      if (result.status === 403 || result.status === 404) {
        router.replace("/dashboard");
        return;
      }
      setDisconnectTimedOut(true);
      setRecoveringConnection(false);
      setShowEndModal(false);
      setEndSessionError(null);
      return;
    }

    if (result.retryAfterMs !== null) {
      setCredentialRetryAvailable(true);
      return;
    }

    setError(
      result.message ||
        "We couldn't restore this interview. Please return to the dashboard."
    );
  }, [connectionOwnerId, disconnectTimedOut, router, session]);

  const retryRoomCredentials = useCallback(() => {
    abortCredentialWork("interview_credentials_manual_retry");
    lastCredentialRequestAtRef.current = 0;
    setCredentialRetryAvailable(false);
    void refreshRoomCredentials();
  }, [abortCredentialWork, refreshRoomCredentials]);

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

      if (
        state === "transport_delayed" ||
        state === "delayed" ||
        state === "syncing"
      ) {
        setRecoveringConnection(false);
      }

      if (state === "disconnected") {
        void refreshRoomCredentials();
      }

      if (state === "connected" || state === "syncing") {
        setCredentialRetryAvailable(false);
        setRecoveringConnection(false);
      }

      if (state === "recovered") {
        setCredentialRetryAvailable(false);
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
    abortBootstrapWork("interview_deadline_reached");
    abortCredentialWork("interview_deadline_reached");
    setDeadlineReached(true);
    setMicrophoneSessionActive(false);
    setShowEndModal(false);
    setEndSessionError(null);
    analytics.track("interview_deadline_reached", {
      session_id: activeSessionId,
      interview_type: session?.config?.roundType,
    });
  }, [
    abortBootstrapWork,
    abortCredentialWork,
    activeSessionId,
    connectionOwnerId,
    session?.config?.roundType,
  ]);

  const terminalClosureRequired = deadlineReached || disconnectTimedOut;

  const startTerminalPollWindow = useCallback(() => {
    if (
      !terminalClosureRequired ||
      !activeSessionId ||
      terminalPollActiveRef.current ||
      terminalNavigationStartedRef.current
    ) {
      return;
    }

    terminalPollActiveRef.current = true;
    setTerminalPollStatus("checking");
    const nextWindowId = terminalPollWindowIdRef.current + 1;
    terminalPollWindowIdRef.current = nextWindowId;
    setTerminalPollGeneration(nextWindowId);
  }, [activeSessionId, terminalClosureRequired]);

  useEffect(() => {
    if (terminalClosureRequired) startTerminalPollWindow();
  }, [startTerminalPollWindow, terminalClosureRequired]);

  // The client only reflects the deadline. The server workflow owns completion
  // and room termination, including when this tab is hidden or killed.
  useEffect(() => {
    if (
      !terminalClosureRequired ||
      !activeSessionId ||
      terminalPollGeneration === 0
    ) {
      return;
    }

    const pollWindowId = terminalPollGeneration;
    const controller = new AbortController();
    void runBoundedSequentialTerminalPoll({
      signal: controller.signal,
      poll: async ({ signal }) => {
        try {
          const response = await fetchWithDeadline(
            `/api/session/${activeSessionId}`,
            {
              cache: "no-store",
              signal,
            }
          );
          if (!response.ok) return false;
          const payload = (await response.json()) as {
            session?: {
              lifecycleState?: string | null;
            };
          };
          if (!canNavigateToInterviewFeedback(payload.session ?? {})) {
            return false;
          }
          replaceTerminalDestination(`/feedback/${activeSessionId}/loading`);
          return true;
        } catch (pollError) {
          if (!signal.aborted) {
            console.warn("[Interview] terminal_poll_failed", {
              code: "terminal_poll_failed",
              ...toSafeErrorLog(pollError),
            });
          }
          return false;
        }
      },
    }).then((result) => {
      if (terminalPollWindowIdRef.current !== pollWindowId) return;
      terminalPollActiveRef.current = false;
      if (result.status === "paused") setTerminalPollStatus("paused");
    });

    return () => {
      controller.abort();
    };
  }, [
    activeSessionId,
    replaceTerminalDestination,
    terminalClosureRequired,
    terminalPollGeneration,
  ]);

  useEffect(() => {
    if (!terminalClosureRequired || terminalPollStatus !== "paused") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") startTerminalPollWindow();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [startTerminalPollWindow, terminalClosureRequired, terminalPollStatus]);

  const startEndPollWindow = useCallback(() => {
    if (
      !endReconciliation ||
      endReconciliation.ownerId !== ownerIdRef.current ||
      endPollActiveRef.current ||
      terminalNavigationStartedRef.current
    ) {
      return;
    }

    endPollActiveRef.current = true;
    setEndPollStatus("checking");
    const nextWindowId = endPollWindowIdRef.current + 1;
    endPollWindowIdRef.current = nextWindowId;
    setEndPollGeneration(nextWindowId);
  }, [endReconciliation]);

  useEffect(() => {
    if (endReconciliation) startEndPollWindow();
  }, [endReconciliation, startEndPollWindow]);

  // A transport failure after transcript cutoff cannot prove whether the
  // idempotent end command committed. Freeze and disconnect the browser room,
  // then poll durable truth and occasionally retry the same command. There is
  // intentionally no resume or dismiss path while that ambiguity remains.
  useEffect(() => {
    if (!endReconciliation || endPollGeneration === 0) return;

    const pollWindowId = endPollGeneration;
    const controller = new AbortController();
    void runBoundedSequentialTerminalPoll({
      signal: controller.signal,
      poll: async ({ signal }) => {
        if (ownerIdRef.current !== endReconciliation.ownerId) return false;
        const retryEnd = Date.now() >= nextEndRetryAtRef.current;
        const result = await reconcileAmbiguousInterviewEnd({
          sessionId: endReconciliation.sessionId,
          retryEnd,
          signal,
        });
        if (ownerIdRef.current !== endReconciliation.ownerId) return false;

        if (result.retryAttempted) {
          nextEndRetryAtRef.current = Date.now() + 10_000;
        }
        if (result.status !== "resolved") return false;

        analytics.track("interview_ended", {
          session_id: endReconciliation.sessionId,
          duration_seconds: endReconciliation.durationSeconds,
          ended_naturally: true,
          interview_type: session?.config?.roundType,
        });
        replaceTerminalDestination(result.nextHref);
        return true;
      },
    }).then((result) => {
      if (endPollWindowIdRef.current !== pollWindowId) return;
      endPollActiveRef.current = false;
      if (result.status === "paused") setEndPollStatus("paused");
    });

    return () => {
      controller.abort();
    };
  }, [
    endPollGeneration,
    endReconciliation,
    replaceTerminalDestination,
    session?.config?.roundType,
  ]);

  useEffect(() => {
    if (!endReconciliation || endPollStatus !== "paused") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") startEndPollWindow();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [endPollStatus, endReconciliation, startEndPollWindow]);

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
    abortBootstrapWork("interview_end_requested");
    abortCredentialWork("interview_end_requested");
    setMicrophoneSessionActive(false);
    setIsEndingSession(true);
    setEndSessionError(null);
    setTranscriptIntegrity("retrying");
    try {
      const duration = sessionStartTime
        ? (Date.now() - sessionStartTime) / 1000
        : 0;

      let response: Response;
      try {
        response = await fetchWithDeadline(
          "/api/interview/end",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: requestSessionId }),
          },
          CUSTOMER_CLIENT_FETCH_DEADLINE_MS
        );
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
        endPollActiveRef.current = false;
        setEndPollStatus("checking");
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
      replaceTerminalDestination(nextHref);
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

  const openEndSessionConfirmation = () => {
    if (deadlineReached || endIntentRef.current || endReconciliation) return;
    endSessionReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setShowEndModal(true);
  };

  const endSessionModal = session ? (
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
  ) : null;

  if (authLoading || (loading && (!session || !hasCurrentConnectionOwner))) {
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
    return (
      <TerminalCompletionOverlay
        kind="ambiguous_end"
        status={endPollStatus}
        onCheckAgain={startEndPollWindow}
        onInterviewHistory={leaveForInterviewHistory}
      />
    );
  }

  if (bootstrapRetryAvailable) {
    return (
      <ConnectionRecoveryOverlay
        status="bootstrap_failed"
        onRetryConnection={() => void fetchSessionDetails()}
        onBackToDashboard={() => router.push("/dashboard")}
      />
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

  if (
    session &&
    hasCurrentConnectionOwner &&
    disconnectTimedOut &&
    (!token || !url)
  ) {
    return (
      <TerminalCompletionOverlay
        kind="disconnect"
        status={terminalPollStatus}
        onCheckAgain={startTerminalPollWindow}
        onInterviewHistory={leaveForInterviewHistory}
      />
    );
  }

  if (
    session &&
    hasCurrentConnectionOwner &&
    recoveringConnection &&
    (!token || !url)
  ) {
    return (
      <>
        <ConnectionRecoveryOverlay
          status="disconnected"
          onEndSession={openEndSessionConfirmation}
          onRetryConnection={
            credentialRetryAvailable ? retryRoomCredentials : undefined
          }
        />
        {endSessionModal}
      </>
    );
  }

  if (session && hasCurrentConnectionOwner && (loading || !token || !url)) {
    return (
      <>
        <ConnectionRecoveryOverlay
          status="connecting"
          onEndSession={openEndSessionConfirmation}
        />
        {endSessionModal}
      </>
    );
  }

  if (!session || !hasCurrentConnectionOwner) {
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
        transcriptHydrationState={transcriptHydrationState}
        agentState={agentState}
        microphoneSessionActive={microphoneSessionActive}
        autoActivateMicrophone={
          microphoneActivatedSessionId !== activeSessionId
        }
        transcriptIntegrity={transcriptIntegrity}
        deadlineReached={deadlineReached}
        connectionStatus={connectionStatus}
        recoveringConnection={recoveringConnection}
        onDeadlineReached={handleDeadlineReached}
        onMicrophoneAutoActivated={() => {
          setMicrophoneActivatedSessionId(activeSessionId);
        }}
        onEndSession={() => {
          openEndSessionConfirmation();
        }}
        onRetryTranscriptHydration={retryTranscriptHydration}
      />
      {endSessionModal}
      {deadlineReached && (
        <TerminalCompletionOverlay
          kind="deadline"
          status={terminalPollStatus}
          onCheckAgain={startTerminalPollWindow}
          onInterviewHistory={leaveForInterviewHistory}
        />
      )}
      {!deadlineReached && disconnectTimedOut && (
        <TerminalCompletionOverlay
          kind="disconnect"
          status={terminalPollStatus}
          onCheckAgain={startTerminalPollWindow}
          onInterviewHistory={leaveForInterviewHistory}
        />
      )}
      {!deadlineReached && !disconnectTimedOut && recoveringConnection && (
        <ConnectionRecoveryOverlay
          status={connectionStatus}
          onEndSession={openEndSessionConfirmation}
          onRetryConnection={
            credentialRetryAvailable ? retryRoomCredentials : undefined
          }
        />
      )}
    </LiveKitRoomWrapper>
  );
}

interface InterviewRoomContentProps {
  session: InterviewSession;
  transcript: TranscriptTurn[];
  transcriptHydrationState: DurableTranscriptHydrationState;
  agentState: "idle" | "listening" | "thinking" | "speaking";
  microphoneSessionActive: boolean;
  autoActivateMicrophone: boolean;
  transcriptIntegrity: "healthy" | "retrying" | "degraded";
  deadlineReached: boolean;
  connectionStatus: InterviewConnectionStatus;
  recoveringConnection: boolean;
  onDeadlineReached: () => void;
  onMicrophoneAutoActivated: () => void;
  onEndSession: () => void;
  onRetryTranscriptHydration: () => void;
}

function InterviewRoomContent({
  session,
  transcript,
  transcriptHydrationState,
  agentState,
  microphoneSessionActive,
  autoActivateMicrophone,
  transcriptIntegrity,
  deadlineReached,
  connectionStatus,
  recoveringConnection,
  onDeadlineReached,
  onMicrophoneAutoActivated,
  onEndSession,
  onRetryTranscriptHydration,
}: InterviewRoomContentProps) {
  const { localParticipant, isMicrophoneEnabled, lastMicrophoneError } =
    useLocalParticipant();
  const connectionReady = isInterviewConversationReady(connectionStatus);
  const canUseMicrophone =
    microphoneSessionActive &&
    !deadlineReached &&
    connectionReady &&
    !recoveringConnection;
  const microphone = useAcknowledgedMicrophone({
    participant: localParticipant,
    actualEnabled: isMicrophoneEnabled,
    canUseMicrophone,
    autoActivate: autoActivateMicrophone,
    providerError: lastMicrophoneError,
    onAutoActivationAcknowledged: onMicrophoneAutoActivated,
    onUserToggleAcknowledged: (enabled) => {
      analytics.track("mic_toggled", {
        session_id: session.id,
        new_state: enabled ? "unmuted" : "muted",
      });
    },
  });

  return (
    <InterviewRoomSurface
      company={session.question?.company}
      connectionIndicator={<ConnectionIndicator status={connectionStatus} />}
      connectionStatus={connectionStatus}
      controls={
        <InterviewControls
          isMuted={!microphone.enabled}
          muteDisabled={!canUseMicrophone || microphone.pending}
          mutePending={microphone.pending}
          microphoneError={microphone.errorMessage}
          onToggleMute={microphone.toggle}
          onEndSession={onEndSession}
        />
      }
      deadlineReached={deadlineReached}
      mediaVisualizer={<AudioVisualizer agentState={agentState} />}
      question={session.question?.text}
      roundType={session.config?.roundType}
      timer={
        <TimerDisplay
          deadlineAt={session.deadline_at}
          onDeadlineReached={onDeadlineReached}
        />
      }
      transcriptIntegrity={transcriptIntegrity}
      transcriptHydrationState={transcriptHydrationState}
      onRetryTranscriptHydration={onRetryTranscriptHydration}
      transcriptPanel={<TranscriptPanel turns={transcript} />}
    />
  );
}

function TerminalCompletionOverlay({
  kind,
  status,
  onCheckAgain,
  onInterviewHistory,
}: {
  kind: "deadline" | "disconnect" | "ambiguous_end";
  status: TerminalPollPresentationState;
  onCheckAgain: () => void;
  onInterviewHistory: () => void;
}) {
  const checking = status === "checking";
  const heading = checking
    ? kind === "deadline"
      ? "Saving your interview"
      : kind === "disconnect"
        ? "Closing your interview"
        : "Confirming interview completion"
    : "Automatic checking paused";
  const description = checking
    ? kind === "ambiguous_end"
      ? "Your room is disconnected while we confirm the saved interview state and safely retry the same end request. You may leave this page; the interview cannot resume while the check is running."
      : "We’re checking the saved interview state before handing you to feedback. This check stops automatically if completion takes longer than expected."
    : "Completion is taking longer than expected. It is safe to leave this page. Check again now or return later from Interview history.";

  return (
    <div
      className="bg-overlay/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-busy={checking}
    >
      <AppSurface
        variant="panel"
        size="lg"
        className="w-full max-w-md text-center shadow-xl"
      >
        {checking ? (
          <Loader2 className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
        ) : (
          <WifiOff className="text-muted-foreground mx-auto mb-4 h-8 w-8" />
        )}
        <StatusPill tone="warning" className="mb-3">
          {checking
            ? kind === "deadline"
              ? "Time is up"
              : kind === "disconnect"
                ? "Connection ended"
                : "Interview frozen"
            : "Check paused"}
        </StatusPill>
        <AppSurfaceTitle className="mb-2">{heading}</AppSurfaceTitle>
        <AppSurfaceDescription className="text-sm">
          {description}
        </AppSurfaceDescription>
        {!checking && (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button type="button" onClick={onCheckAgain}>
              Check again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onInterviewHistory}
            >
              Interview history
            </Button>
          </div>
        )}
      </AppSurface>
    </div>
  );
}

function ConnectionRecoveryOverlay({
  status,
  onEndSession,
  onRetryConnection,
  onBackToDashboard,
}: {
  status: InterviewConnectionStatus | "timed_out" | "bootstrap_failed";
  onEndSession?: () => void;
  onRetryConnection?: () => void;
  onBackToDashboard?: () => void;
}) {
  const timedOut = status === "timed_out";
  const bootstrapFailed = status === "bootstrap_failed";
  const connecting = status === "connecting";
  return (
    <div
      className="bg-overlay/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role={bootstrapFailed ? "alert" : "status"}
      aria-live={timedOut || bootstrapFailed ? "assertive" : "polite"}
    >
      <AppSurface
        variant="panel"
        size="lg"
        className="w-full max-w-md text-center shadow-xl"
      >
        {timedOut ? (
          <WifiOff className="text-muted-foreground mx-auto mb-4 h-8 w-8" />
        ) : bootstrapFailed ? (
          <RefreshCw className="text-warning mx-auto mb-4 h-8 w-8" />
        ) : (
          <Loader2 className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
        )}
        <StatusPill
          tone={timedOut || bootstrapFailed ? "warning" : "primary"}
          className="mb-3"
        >
          {timedOut
            ? "Connection ended"
            : bootstrapFailed
              ? "Room delayed"
              : connecting
                ? "Connecting"
                : "Reconnecting"}
        </StatusPill>
        <AppSurfaceTitle className="mb-2">
          {timedOut
            ? "Closing your interview"
            : bootstrapFailed
              ? "Your interview room is taking longer to load"
              : connecting
                ? "Connecting to your interviewer"
                : "Restoring your interview"}
        </AppSurfaceTitle>
        <AppSurfaceDescription className="text-sm">
          {timedOut
            ? "The reconnect window ended. We’re closing this interview once and preparing the available feedback. Keep this page open."
            : bootstrapFailed
              ? "Your existing interview is still the only session we’ll use. Retry this room when you’re ready, or return to the dashboard."
              : connecting
                ? "Your interview is saved while we prepare the room. You can end safely without waiting for the connection."
                : "Keep this page open. Your interview and saved transcript stay in place while we restore the connection. You can still end safely."}
        </AppSurfaceDescription>
        {bootstrapFailed && onRetryConnection && (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              className="min-h-11"
              onClick={onRetryConnection}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry interview room
            </Button>
            {onBackToDashboard && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={onBackToDashboard}
              >
                Back to dashboard
              </Button>
            )}
          </div>
        )}
        {!bootstrapFailed && !timedOut && onRetryConnection && (
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              className="min-h-11"
              onClick={onRetryConnection}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry room connection
            </Button>
          </div>
        )}
        {!timedOut && onEndSession && (
          <div className="mt-4 flex justify-center">
            <InterviewControls
              isMuted
              muteDisabled
              onToggleMute={() => undefined}
              onEndSession={onEndSession}
            />
          </div>
        )}
      </AppSurface>
    </div>
  );
}

async function requestInterviewSessionWithRetry(
  sessionId: string,
  signal: AbortSignal
): Promise<SessionBootstrapResult> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal.aborted) return { disposition: "aborted" };

    let response: Response | null = null;
    let payload: unknown = null;
    try {
      response = await fetchWithDeadline(
        `/api/session/${sessionId}`,
        { cache: "no-store", signal },
        INTERVIEW_START_SLOS.customer_read.upperBoundMs
      );
      payload = await response.json().catch(() => null);
    } catch {
      if (signal.aborted) return { disposition: "aborted" };
    }

    if (response) {
      const disposition = classifyInterviewSessionBootstrapResponse(
        response.status,
        payload
      );
      if (disposition === "ready") {
        return { disposition: "ready", payload };
      }
      if (disposition === "authorization_lost" || disposition === "terminal") {
        return {
          disposition: "terminal",
          status: response.status,
          message:
            isRecord(payload) && typeof payload.message === "string"
              ? payload.message
              : undefined,
        };
      }
    }

    if (attempt >= maxAttempts - 1) {
      return { disposition: "retryable_exhausted" };
    }

    try {
      await waitForInterviewRecoveryDelay(
        getInterviewRetryDelayMs(response?.headers.get("Retry-After") ?? null),
        signal
      );
    } catch {
      return { disposition: "aborted" };
    }
  }

  return { disposition: "retryable_exhausted" };
}

async function requestInterviewRoomCredentialsWithRetry(
  sessionId: string,
  expectedRoomName: string,
  signal: AbortSignal
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
    if (signal.aborted) return { ok: false, aborted: true };
    try {
      const response = await fetchWithDeadline(
        "/api/livekit/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal,
        },
        INTERVIEW_START_SLOS.customer_read.upperBoundMs
      );
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const credentials = parseInterviewRoomCredentials(
          payload,
          expectedRoomName
        );
        if (credentials) {
          // The token workflow performs a post-sign authorization fence. The
          // browser validates the fenced response shape and hands it directly
          // to LiveKit without racing a third lifecycle read.
          return { ok: true, credentials };
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
      if (signal.aborted) return { ok: false, aborted: true };
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
      try {
        await waitForInterviewRecoveryDelay(lastFailure.retryAfterMs, signal);
      } catch {
        return { ok: false, aborted: true };
      }
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
    question: session.question ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeTranscriptTurns(
  current: TranscriptTurn[],
  incoming: TranscriptTurn[]
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  const identityToIndex = new Map<string, number>();

  for (const turn of [...current, ...incoming]) {
    const identities = getTranscriptTurnIdentities(turn);
    const existingIndex = identities.flatMap((identity) => {
      const index = identityToIndex.get(identity);
      return index === undefined ? [] : [index];
    })[0];

    const index = existingIndex ?? turns.length;
    turns[index] =
      existingIndex === undefined
        ? turn
        : mergeDefinedTranscriptTurn(turns[index], turn);

    for (const identity of getTranscriptTurnIdentities(turns[index])) {
      identityToIndex.set(identity, index);
    }
  }

  return turns.sort(compareTranscriptOrdering);
}

function normalizeHydratedTranscriptPayload(
  payload: unknown,
  requestSessionId: string
): TranscriptTurn[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.turns)) return null;

  const hydrated: TranscriptTurn[] = [];
  for (const value of payload.turns) {
    if (!isRecord(value)) return null;
    if (
      typeof value.id !== "string" ||
      value.sessionId !== requestSessionId ||
      (value.speaker !== "user" && value.speaker !== "interviewer")
    ) {
      return null;
    }

    const text = optionalString(value.text);
    const startedAt = optionalDate(value.startedAt);
    const endedAt = optionalDate(value.endedAt);
    if (text === null || startedAt === null || endedAt === null) return null;
    if (text === undefined || startedAt === undefined) continue;

    hydrated.push({
      persistable: typeof value.eventId === "string",
      eventId: typeof value.eventId === "string" ? value.eventId : value.id,
      rowId: value.id,
      writerId: optionalStringValue(value.writerId),
      writerGeneration: optionalNumber(value.writerGeneration),
      sequence: optionalNumber(value.sequence),
      sessionId: value.sessionId,
      roomName: optionalStringValue(value.roomName),
      speaker: value.speaker,
      text,
      timestamp: startedAt,
      startedAt,
      endedAt,
      audioMs: optionalNumber(value.audioMs),
      section: optionalStringValue(value.section),
      deliveryState:
        value.deliveryState === "delivered" ||
        value.deliveryState === "partially_delivered"
          ? value.deliveryState
          : undefined,
    });
  }
  return hydrated;
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : null;
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalDate(value: unknown): Date | undefined | null {
  const raw = optionalString(value);
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTranscriptTurnIdentities(turn: TranscriptTurn): string[] {
  const identities: string[] = [];
  if (turn.eventId) identities.push(`event:${turn.eventId}`);
  if (turn.rowId) identities.push(`row:${turn.rowId}`);
  if (identities.length === 0) {
    identities.push(
      `legacy:${turn.speaker}:${turn.timestamp.toISOString()}:${turn.text}`
    );
  }
  return identities;
}

function mergeDefinedTranscriptTurn(
  current: TranscriptTurn,
  incoming: TranscriptTurn
): TranscriptTurn {
  const merged = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as TranscriptTurn;
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

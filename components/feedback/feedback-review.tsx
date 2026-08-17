"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  CompletedDimensionCoverageReview,
  CompletedLegacyReview,
  CompletedEvidenceLimitedReview,
  CompletedV2Review,
} from "./feedback-completed-review";
import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "./feedback-lifecycle-status";
import { FeedbackDashboardLink } from "./feedback-navigation";
import {
  decodeFeedbackHttpResponseOrThrow,
  decodeFeedbackResponseOrThrow,
  toFeedbackTransportFailure,
} from "./feedback-response";
import { FeedbackStatusPage } from "./feedback-surface";
import {
  createFeedbackPollBudget,
  createFeedbackRecoveryCoordinator,
} from "@/lib/utils/feedback-client-recovery";
import {
  toFeedbackViewState,
  type FeedbackLifecycleResponse,
  type FeedbackViewState,
  type SavedInterviewWorkspace,
} from "@meelni/core";
import { fetchWithDeadline } from "@/lib/http/deadline";
import { buildFeedbackReauthenticationHref } from "./feedback-auth-navigation";

const FEEDBACK_POLL_INTERVAL_MS = 3000;
const MAX_FEEDBACK_POLLS = 30;

type FeedbackPollingPhase = "automatic" | "paused";

export function FeedbackReview({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const reauthenticationHref = buildFeedbackReauthenticationHref(sessionId);
  const [viewState, setViewState] = useState<FeedbackViewState | null>(null);
  const [savedWorkspace, setSavedWorkspace] =
    useState<SavedInterviewWorkspace | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pollingPhase, setPollingPhase] =
    useState<FeedbackPollingPhase>("automatic");
  const recoveryCoordinator = useRef(createFeedbackRecoveryCoordinator());
  const pollBudget = useRef(createFeedbackPollBudget(MAX_FEEDBACK_POLLS));
  const checkAgainRef = useRef<() => Promise<void>>(async () => undefined);
  const recoverRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    recoveryCoordinator.current = createFeedbackRecoveryCoordinator();
    pollBudget.current = createFeedbackPollBudget(MAX_FEEDBACK_POLLS);
    setViewState(null);
    setSavedWorkspace(null);
    setTransportError(null);
    setRecoveryError(null);
    setChecking(false);
    setRecovering(false);
    setPollingPhase("automatic");
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    let latestResponse: FeedbackLifecycleResponse | null = null;
    let readInFlight: Promise<void> | null = null;
    let recoveryInFlight: Promise<FeedbackLifecycleResponse> | null = null;

    const clearPollTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedulePoll = () => {
      if (!pollBudget.current.consume()) {
        setPollingPhase("paused");
        return;
      }
      timer = setTimeout(fetchFeedback, FEEDBACK_POLL_INTERVAL_MS);
    };

    const requestRecovery = () => {
      if (recoveryInFlight) return recoveryInFlight;
      const request = requestFeedbackRecovery(
        sessionId,
        controller.signal,
        () => router.replace(reauthenticationHref)
      );
      recoveryInFlight = request;
      void request.then(
        () => {
          if (recoveryInFlight === request) recoveryInFlight = null;
        },
        () => {
          if (recoveryInFlight === request) recoveryInFlight = null;
        }
      );
      return request;
    };

    const applyResponse = async (
      response: FeedbackLifecycleResponse,
      { allowAutomaticRecovery = true } = {}
    ) => {
      if (!active) return;
      latestResponse = response;
      setViewState(toFeedbackViewState(response));
      if (response.workspace) setSavedWorkspace(response.workspace);
      setTransportError(null);
      setPollingPhase("automatic");

      if (allowAutomaticRecovery && response.retryable === true) {
        setRecovering(true);
        try {
          const recovery = await recoveryCoordinator.current.attempt(
            response,
            requestRecovery
          );
          if (!active) return;
          if (recovery.disposition === "recovered") {
            latestResponse = recovery.value;
            setViewState(toFeedbackViewState(recovery.value));
            if (recovery.value.workspace) {
              setSavedWorkspace(recovery.value.workspace);
            }
            setRecoveryError(null);
            pollBudget.current.reset();
            if (
              recovery.value.status === "settling" ||
              recovery.value.status === "pending" ||
              recovery.value.status === "processing"
            ) {
              schedulePoll();
            } else if (recovery.value.status === "completed") {
              timer = setTimeout(fetchFeedback, 0);
            }
            return;
          }
        } catch (error) {
          if (!active) return;
          if (error instanceof FeedbackReauthenticationRequiredError) return;
          setRecoveryError(getErrorMessage(error));
        } finally {
          if (active) setRecovering(false);
        }
      }

      if (
        response.status === "settling" ||
        response.status === "pending" ||
        response.status === "processing"
      ) {
        schedulePoll();
      }
    };

    function fetchFeedback({
      allowAutomaticRecovery = true,
      resumeAutomaticPolling = false,
      customerInitiated = false,
    } = {}): Promise<void> {
      if (readInFlight) return readInFlight;
      if (resumeAutomaticPolling) {
        clearPollTimer();
        pollBudget.current.reset();
        setRecoveryError(null);
        setTransportError(null);
        setPollingPhase("automatic");
      }
      if (customerInitiated) setChecking(true);

      const request = (async () => {
        try {
          const response = await fetchWithDeadline(
            `/api/feedback/${sessionId}`,
            { signal: controller.signal }
          );
          const payload: unknown = await response.json().catch(() => null);
          if (response.status === 401) {
            router.replace(reauthenticationHref);
            return;
          }
          const body = decodeFeedbackHttpResponseOrThrow(response, payload);
          await applyResponse(body, { allowAutomaticRecovery });
        } catch (error) {
          if (!active) return;
          const transportFailure = toFeedbackTransportFailure(error);
          if (transportFailure?.retryable) {
            setViewState(
              (current) =>
                current ?? {
                  kind: "settling",
                  retryable: false,
                  delayed: false,
                  message: transportFailure.message,
                }
            );
            setTransportError(transportFailure.message);
            schedulePoll();
            return;
          }

          const message = transportFailure?.message || getErrorMessage(error);
          setViewState({ kind: "unavailable", message });
          setTransportError(message);
        } finally {
          if (active && customerInitiated) setChecking(false);
        }
      })();
      readInFlight = request;
      void request.then(
        () => {
          if (readInFlight === request) readInFlight = null;
        },
        () => {
          if (readInFlight === request) readInFlight = null;
        }
      );
      return request;
    }

    checkAgainRef.current = () =>
      fetchFeedback({
        allowAutomaticRecovery: false,
        resumeAutomaticPolling: true,
        customerInitiated: true,
      });

    recoverRef.current = async () => {
      if (readInFlight) await readInFlight;
      if (!active || latestResponse?.retryable !== true) return;
      clearPollTimer();
      setRecovering(true);
      setRecoveryError(null);
      try {
        const response = await requestRecovery();
        if (!active) return;
        pollBudget.current.reset();
        await applyResponse(response, { allowAutomaticRecovery: false });
      } catch (error) {
        if (!active) return;
        if (error instanceof FeedbackReauthenticationRequiredError) return;
        setRecoveryError(getErrorMessage(error));
        setPollingPhase("paused");
      } finally {
        if (active) setRecovering(false);
      }
    };

    void fetchFeedback();
    return () => {
      active = false;
      controller.abort();
      clearPollTimer();
      checkAgainRef.current = async () => undefined;
      recoverRef.current = async () => undefined;
    };
  }, [reauthenticationHref, router, sessionId]);

  const checkAgain = () => checkAgainRef.current();
  const recover = () => recoverRef.current();

  if (!viewState) {
    if (transportError) {
      return (
        <FeedbackStatusPage
          role="alert"
          tone="danger"
          icon={<AlertTriangle className="h-8 w-8" aria-hidden="true" />}
          title="Feedback unavailable"
          description={transportError}
          actions={<FeedbackDashboardLink />}
        />
      );
    }
    return <FeedbackLoadingSkeleton />;
  }

  if (
    viewState.kind === "completed-full" ||
    viewState.kind === "completed-partial"
  ) {
    return (
      <CompletedV2Review
        feedback={viewState.feedback}
        partial={viewState.kind === "completed-partial"}
      />
    );
  }
  if (viewState.kind === "completed-legacy") {
    return <CompletedLegacyReview feedback={viewState.feedback} />;
  }
  if (viewState.kind === "completed-evidence-limited") {
    return <CompletedEvidenceLimitedReview feedback={viewState.feedback} />;
  }
  if (
    viewState.kind === "completed-scorecard" ||
    viewState.kind === "completed-coaching-review"
  ) {
    return <CompletedDimensionCoverageReview feedback={viewState.feedback} />;
  }
  return (
    <FeedbackLifecycleStatus
      state={viewState}
      workspace={savedWorkspace}
      recovering={recovering}
      recoveryError={recoveryError || transportError}
      checking={checking}
      pollingPaused={pollingPhase === "paused"}
      pausedMessage={
        pollingPhase === "paused" && (recoveryError || transportError)
          ? "We couldn’t check your feedback just now. Your interview is saved, and automatic checking is paused."
          : null
      }
      sessionId={sessionId}
      onCheckAgain={checkAgain}
      onRecover={recover}
    />
  );
}

async function requestFeedbackRecovery(
  sessionId: string,
  signal: AbortSignal | undefined,
  onUnauthorized: () => void
): Promise<FeedbackLifecycleResponse> {
  const response = await fetchWithDeadline(`/api/feedback/${sessionId}`, {
    method: "POST",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 401) {
    onUnauthorized();
    throw new FeedbackReauthenticationRequiredError();
  }
  const errorMessage =
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : null;
  if (!response.ok) {
    throw new Error(
      errorMessage || "Feedback could not be queued. Please try again."
    );
  }
  const status =
    typeof payload === "object" &&
    payload !== null &&
    "status" in payload &&
    typeof payload.status === "string"
      ? payload.status
      : null;
  if (status === "completed" || status === "skipped" || status === "failed") {
    const refreshed = await fetchWithDeadline(`/api/feedback/${sessionId}`, {
      signal,
    });
    const refreshedPayload: unknown = await refreshed.json().catch(() => null);
    if (refreshed.status === 401) {
      onUnauthorized();
      throw new FeedbackReauthenticationRequiredError();
    }
    if (!refreshed.ok) {
      throw new Error("Feedback status could not be refreshed.");
    }
    return decodeFeedbackResponseOrThrow(refreshedPayload);
  }
  return decodeFeedbackResponseOrThrow(payload);
}

class FeedbackReauthenticationRequiredError extends Error {
  constructor() {
    super("feedback_reauthentication_required");
    this.name = "FeedbackReauthenticationRequiredError";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Feedback could not be loaded. Please try again.";
}

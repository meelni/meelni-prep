"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  CompletedLegacyReview,
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
} from "@meelni/core";
import { fetchWithDeadline } from "@/lib/http/deadline";

const FEEDBACK_POLL_INTERVAL_MS = 3000;
const MAX_FEEDBACK_POLLS = 30;

export function FeedbackReview({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [viewState, setViewState] = useState<FeedbackViewState | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const recoveryCoordinator = useRef(createFeedbackRecoveryCoordinator());
  const pollBudget = useRef(createFeedbackPollBudget(MAX_FEEDBACK_POLLS));

  useEffect(() => {
    recoveryCoordinator.current = createFeedbackRecoveryCoordinator();
    pollBudget.current = createFeedbackPollBudget(MAX_FEEDBACK_POLLS);
    setViewState(null);
    setTransportError(null);
    setRecoveryError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const schedulePoll = () => {
      if (!pollBudget.current.consume()) {
        setTransportError(
          "Feedback is taking longer than expected. Your interview is saved; check again shortly."
        );
        return;
      }
      timer = setTimeout(fetchFeedback, FEEDBACK_POLL_INTERVAL_MS);
    };

    const applyResponse = async (response: FeedbackLifecycleResponse) => {
      if (!active) return;
      setViewState(toFeedbackViewState(response));
      setTransportError(null);

      if (response.retryable === true) {
        setRecovering(true);
        try {
          const recovery = await recoveryCoordinator.current.attempt(
            response,
            () => requestFeedbackRecovery(sessionId, controller.signal)
          );
          if (!active) return;
          if (recovery.disposition === "recovered") {
            setViewState(toFeedbackViewState(recovery.value));
            setRecoveryError(null);
            pollBudget.current.reset();
            if (
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

    async function fetchFeedback() {
      try {
        const response = await fetchWithDeadline(`/api/feedback/${sessionId}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401) {
          router.replace("/auth/signin");
          return;
        }
        const body = decodeFeedbackHttpResponseOrThrow(response, payload);
        await applyResponse(body);
      } catch (error) {
        if (!active) return;
        const transportFailure = toFeedbackTransportFailure(error);
        if (transportFailure?.retryable) {
          setViewState(
            (current) =>
              current ?? {
                kind: "settling",
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
      }
    }

    void fetchFeedback();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [router, sessionId]);

  const recover = async () => {
    setRecovering(true);
    setRecoveryError(null);
    try {
      const response = await requestFeedbackRecovery(sessionId);
      setViewState(toFeedbackViewState(response));
      window.location.reload();
    } catch (error) {
      setRecoveryError(getErrorMessage(error));
    } finally {
      setRecovering(false);
    }
  };

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
  return (
    <FeedbackLifecycleStatus
      state={viewState}
      recovering={recovering}
      recoveryError={recoveryError || transportError}
      onRecover={recover}
    />
  );
}

async function requestFeedbackRecovery(
  sessionId: string,
  signal?: AbortSignal
): Promise<FeedbackLifecycleResponse> {
  const response = await fetchWithDeadline(`/api/feedback/${sessionId}`, {
    method: "POST",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
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
    if (!refreshed.ok) {
      throw new Error("Feedback status could not be refreshed.");
    }
    return decodeFeedbackResponseOrThrow(refreshedPayload);
  }
  return decodeFeedbackResponseOrThrow(payload);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Feedback could not be loaded. Please try again.";
}

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
    if (!sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

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
            () => requestFeedbackRecovery(sessionId)
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

      if (response.status === "pending" || response.status === "processing") {
        schedulePoll();
      }
    };

    async function fetchFeedback() {
      try {
        const response = await fetch(`/api/feedback/${sessionId}`);
        const body = (await response
          .json()
          .catch(() => null)) as FeedbackLifecycleResponse | null;
        if (response.status === 401) {
          router.replace("/auth/signin");
          return;
        }
        if (!body || !("status" in body)) {
          throw new Error("Feedback could not be loaded.");
        }
        if (!response.ok && body.status !== "session_not_ended") {
          throw new Error("Feedback could not be loaded.");
        }
        await applyResponse(body);
      } catch (error) {
        if (active) setTransportError(getErrorMessage(error));
      }
    }

    void fetchFeedback();
    return () => {
      active = false;
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
  sessionId: string
): Promise<FeedbackLifecycleResponse> {
  const response = await fetch(`/api/feedback/${sessionId}`, {
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as {
    status?: string;
    message?: string;
  } | null;
  if (!response.ok || !body?.status) {
    throw new Error(
      body?.message || "Feedback could not be queued. Please try again."
    );
  }
  if (body.status === "completed" || body.status === "skipped") {
    const refreshed = await fetch(`/api/feedback/${sessionId}`);
    const refreshedBody = (await refreshed
      .json()
      .catch(() => null)) as FeedbackLifecycleResponse | null;
    if (!refreshed.ok || !refreshedBody) {
      throw new Error("Feedback status could not be refreshed.");
    }
    return refreshedBody;
  }
  return body as FeedbackLifecycleResponse;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Feedback could not be loaded. Please try again.";
}

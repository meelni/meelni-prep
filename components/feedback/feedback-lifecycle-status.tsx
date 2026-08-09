"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CircleX,
  Clock3,
  FileWarning,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import { FeedbackDashboardLink } from "./feedback-navigation";
import {
  FeedbackReviewShell,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "./feedback-surface";
import { Button } from "@/components/ui/button";
import type { FeedbackViewState, SkippedFeedbackDetails } from "@meelni/core";

type FeedbackNonCompletedState = Exclude<
  FeedbackViewState,
  | { kind: "completed-full" }
  | { kind: "completed-partial" }
  | { kind: "completed-legacy" }
>;

export function FeedbackLifecycleStatus({
  state,
  recovering,
  recoveryError,
  checking = false,
  pollingPaused = false,
  pausedMessage = null,
  sessionId = "",
  onCheckAgain = () => undefined,
  onRecover,
}: {
  state: FeedbackNonCompletedState;
  recovering: boolean;
  recoveryError: string | null;
  checking?: boolean;
  pollingPaused?: boolean;
  pausedMessage?: string | null;
  sessionId?: string;
  onCheckAgain?: () => void | Promise<void>;
  onRecover: () => void | Promise<void>;
}) {
  const retryAction = (label: string) => (
    <Button className="min-h-11" onClick={onRecover} disabled={recovering}>
      {recovering ? (
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {recovering ? "Trying again" : label}
    </Button>
  );

  if (
    pollingPaused &&
    (state.kind === "settling" ||
      state.kind === "pending" ||
      state.kind === "processing")
  ) {
    return (
      <FeedbackStatusPage
        role="status"
        aria-live="polite"
        aria-busy="false"
        tone="warning"
        icon={<Clock3 className="h-8 w-8" aria-hidden="true" />}
        title="Automatic checking paused"
        description={
          pausedMessage ||
          "Your interview is saved. Automatic checking paused after several attempts; check again when you’re ready."
        }
        actions={
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              className="min-h-11"
              onClick={onCheckAgain}
              disabled={checking}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  checking ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
              {checking ? "Checking now" : "Check again"}
            </Button>
            <Button asChild className="min-h-11" variant="outline">
              <Link href="/dashboard/history">View interview history</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (state.kind === "pending" || state.kind === "processing") {
    const processing = state.kind === "processing";
    const delayed = state.delayed;
    return (
      <FeedbackStatusPage
        role="status"
        aria-live="polite"
        aria-busy="true"
        tone={delayed ? "warning" : "info"}
        icon={
          <LoaderCircle className="h-8 w-8 animate-spin motion-reduce:animate-none" />
        }
        title={
          delayed
            ? processing
              ? "Feedback is taking longer"
              : "Feedback queue is delayed"
            : processing
              ? "Reviewing your interview"
              : "Feedback queued"
        }
        description={
          recoveryError ||
          (delayed
            ? processing
              ? "Your interview is saved and feedback is still being prepared. You can safely leave and return from Interview history."
              : "Your interview is saved, but feedback has not started on time. We’ll keep checking the queue."
            : processing
              ? "We’re connecting observations to your recorded answers. This page updates automatically."
              : "Your interview is saved and waiting for feedback review.")
        }
        actions={
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {state.retryable &&
              retryAction(processing ? "Restart review" : "Queue feedback")}
            {delayed ? (
              <Button
                asChild
                className="min-h-11"
                variant={state.retryable ? "outline" : "default"}
              >
                <Link href="/dashboard/history">View interview history</Link>
              </Button>
            ) : !state.retryable ? (
              <p className="text-muted-foreground text-sm">
                You can leave this page and return from Interview history.
              </p>
            ) : null}
          </div>
        }
      />
    );
  }

  if (state.kind === "missing") {
    return (
      <FeedbackStatusPage
        role="status"
        aria-live="polite"
        tone="warning"
        icon={<Clock3 className="h-8 w-8" aria-hidden="true" />}
        title="Feedback has not started"
        description={
          recoveryError ||
          state.message ||
          "Your interview is saved. Queue feedback to continue."
        }
        actions={retryAction("Queue feedback")}
      />
    );
  }

  if (state.kind === "session-active") {
    return (
      <FeedbackStatusPage
        tone="warning"
        icon={<Clock3 className="h-8 w-8" aria-hidden="true" />}
        title="Interview still in progress"
        description={
          state.message || "End the interview before opening its feedback."
        }
        actions={
          <Button asChild>
            <Link
              href={`/interview?sessionId=${encodeURIComponent(sessionId)}`}
            >
              Return to interview
            </Link>
          </Button>
        }
      />
    );
  }

  if (state.kind === "settling") {
    return (
      <FeedbackStatusPage
        role="status"
        aria-live="polite"
        aria-busy="true"
        tone={state.delayed ? "warning" : "info"}
        icon={
          <LoaderCircle className="h-8 w-8 animate-spin motion-reduce:animate-none" />
        }
        title={
          state.delayed
            ? "Interview saving is delayed"
            : "Saving your interview"
        }
        description={
          state.message ||
          (state.delayed
            ? "Your interview is saved, but the final handoff did not finish on time. Retry the handoff or return from Interview history."
            : "Your interview is saved while the session finishes closing safely.")
        }
        actions={
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {state.retryable && retryAction("Retry saving")}
            <Button asChild variant={state.retryable ? "outline" : "default"}>
              <Link href="/dashboard/history">View interview history</Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              You can safely leave; feedback starts automatically.
            </p>
          </div>
        }
      />
    );
  }

  if (
    state.kind === "skipped-insufficient" ||
    state.kind === "skipped-abandoned"
  ) {
    return (
      <SkippedStatus
        abandoned={state.kind === "skipped-abandoned"}
        details={state.details}
      />
    );
  }

  if (state.kind === "completed-invalid") {
    return (
      <FeedbackStatusPage
        role="alert"
        tone="danger"
        icon={<FileWarning className="h-8 w-8" aria-hidden="true" />}
        title="Feedback cannot be displayed"
        description="This saved feedback is incomplete or uses an unsupported format. No score has been inferred from it."
        actions={<FeedbackDashboardLink />}
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <FeedbackStatusPage
        role="alert"
        tone="danger"
        icon={<FileWarning className="h-8 w-8" aria-hidden="true" />}
        title="Feedback unavailable"
        description={state.message}
        actions={<FeedbackDashboardLink />}
      />
    );
  }

  const retryable = state.kind === "failed-retryable";
  return (
    <FeedbackStatusPage
      role="alert"
      tone="danger"
      icon={<CircleX className="h-8 w-8" aria-hidden="true" />}
      title="Feedback review failed"
      description={recoveryError || state.message}
      actions={
        <>
          {retryable && retryAction("Try feedback again")}
          <FeedbackDashboardLink />
        </>
      }
    />
  );
}

function SkippedStatus({
  abandoned,
  details,
}: {
  abandoned: boolean;
  details: SkippedFeedbackDetails;
}) {
  return (
    <FeedbackStatusPage
      tone="warning"
      icon={<AlertTriangle className="h-8 w-8" aria-hidden="true" />}
      title={
        abandoned
          ? "Interview ended before practice began"
          : "Not enough evidence for feedback"
      }
      description={
        abandoned
          ? "No recorded answer was available to evaluate."
          : "The recorded interview did not meet the minimum evidence threshold for honest scores."
      }
      actions={
        <Button asChild>
          <Link href="/dashboard/new-interview">
            Start a new mock interview
          </Link>
        </Button>
      }
    >
      {(details.reasons.length > 0 || details.recommendations.length > 0) && (
        <FeedbackSectionCard
          title="What happened"
          contentClassName="space-y-4 text-left"
        >
          {details.reasons.map((reason, index) => (
            <p
              key={`reason:${index}`}
              className="text-muted-foreground text-sm wrap-anywhere"
            >
              {reason}
            </p>
          ))}
          {details.recommendations.map((recommendation, index) => (
            <p
              key={`recommendation:${index}`}
              className="text-foreground text-sm wrap-anywhere"
            >
              {recommendation}
            </p>
          ))}
        </FeedbackSectionCard>
      )}
    </FeedbackStatusPage>
  );
}

export function FeedbackLoadingSkeleton() {
  return (
    <FeedbackReviewShell
      role="status"
      aria-live="polite"
      aria-busy="true"
      title="Interview feedback"
      description="Loading your saved feedback."
    >
      <span className="sr-only">Loading feedback</span>
      <div className="space-y-6 motion-reduce:[&_*]:animate-none">
        {["h-24", "h-40", "h-64"].map((height) => (
          <div
            key={height}
            className={`bg-muted animate-pulse rounded-lg ${height}`}
          />
        ))}
      </div>
    </FeedbackReviewShell>
  );
}

"use client";

import Link from "next/link";
import {
  Check,
  Clock3,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

import {
  FeedbackTranscriptSection,
  useEvidenceTranscript,
} from "./feedback-transcript";
import { FeedbackReviewShell, FeedbackSectionCard } from "./feedback-surface";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/app-surface";
import {
  INTERVIEW_TYPE_LABELS,
  type SavedInterviewWorkspace,
} from "@meelni/core";

type ProcessingState = "settling" | "pending" | "processing";

export function SavedInterviewProcessingWorkspace({
  sessionId,
  workspace,
  state,
  delayed,
  retryable,
  pollingPaused,
  checking,
  recovering,
  statusMessage,
  onCheckAgain,
  onRecover,
}: {
  sessionId: string;
  workspace: SavedInterviewWorkspace;
  state: ProcessingState;
  delayed: boolean;
  retryable: boolean;
  pollingPaused: boolean;
  checking: boolean;
  recovering: boolean;
  statusMessage: string | null;
  onCheckAgain: () => void | Promise<void>;
  onRecover: () => void | Promise<void>;
}) {
  const transcript = useEvidenceTranscript(sessionId);
  const roundLabel = INTERVIEW_TYPE_LABELS[workspace.roundType];
  const currentStep =
    state === "settling" && workspace.frozenTranscript === "pending" ? 2 : 3;
  const status = getStatusCopy({
    state,
    delayed,
    pollingPaused,
    statusMessage,
  });

  return (
    <FeedbackReviewShell
      label={
        <StatusPill tone="success">
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Interview saved
        </StatusPill>
      }
      title={workspace.question?.text ?? "Your saved mock interview"}
      description={`${roundLabel} mock interview${
        workspace.question?.company ? ` · ${workspace.question.company}` : ""
      }`}
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard/history">View interview history</Link>
        </Button>
      }
    >
      <FeedbackSectionCard
        tone={delayed || pollingPaused ? "warning" : "info"}
        title="Review progress"
        icon={
          pollingPaused ? (
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <LoaderCircle
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )
        }
      >
        <div className="space-y-5">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy={!pollingPaused}
            data-feedback-stage-status
            className="space-y-1"
          >
            <h2 className="text-foreground text-lg font-semibold">
              {status.title}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {status.description}
            </p>
          </div>
          <ol
            className="grid gap-3 sm:grid-cols-3"
            aria-label="Review progress"
          >
            <ProgressStep
              number={1}
              title="Interview saved"
              state="complete"
              current={false}
            />
            <ProgressStep
              number={2}
              title="Finalized transcript"
              state={
                workspace.frozenTranscript === "ready"
                  ? "complete"
                  : workspace.frozenTranscript === "pending" &&
                      currentStep === 2
                    ? "current"
                    : "unavailable"
              }
              current={currentStep === 2}
            />
            <ProgressStep
              number={3}
              title="Feedback review"
              state={currentStep === 3 ? "current" : "waiting"}
              current={currentStep === 3}
            />
          </ol>

          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {pollingPaused ? (
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
            ) : retryable ? (
              <Button
                className="min-h-11"
                onClick={onRecover}
                disabled={recovering}
              >
                {recovering ? (
                  <LoaderCircle
                    className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {recovering ? "Trying again" : getRecoveryLabel(state)}
              </Button>
            ) : null}
            <p className="text-muted-foreground text-sm leading-6">
              You can safely leave this page and return from Interview history.
            </p>
          </div>
        </div>
      </FeedbackSectionCard>

      {workspace.frozenTranscript === "ready" ? (
        <FeedbackTranscriptSection
          title="Saved interview transcript"
          description="Only finalized saved evidence is shown. Late or unverified transcript text is excluded."
          expanded={transcript.expanded}
          onExpandedChange={transcript.setExpanded}
          loading={transcript.loading}
          error={transcript.error}
          navigationError={transcript.navigationError}
          turns={transcript.turns}
          onRetry={transcript.retry}
        />
      ) : (
        <FeedbackSectionCard
          title="Saved interview transcript"
          icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
          description="Only finalized saved evidence can appear here."
          tone={workspace.frozenTranscript === "pending" ? "info" : "warning"}
        >
          <p className="text-muted-foreground text-sm leading-6">
            {workspace.frozenTranscript === "pending"
              ? "Finalized transcript is still being prepared. Unverified transcript text will not be shown."
              : "Finalized transcript evidence is unavailable. No unverified transcript text will be substituted."}
          </p>
        </FeedbackSectionCard>
      )}
    </FeedbackReviewShell>
  );
}

function ProgressStep({
  number,
  title,
  state,
  current,
}: {
  number: number;
  title: string;
  state: "complete" | "current" | "waiting" | "unavailable";
  current: boolean;
}) {
  const stateLabel = {
    complete: "Complete",
    current: "Current",
    waiting: "Waiting",
    unavailable: "Unavailable",
  }[state];
  return (
    <li
      aria-current={current ? "step" : undefined}
      className="border-border bg-background/50 min-w-0 rounded-lg border p-3"
    >
      <div className="flex items-start gap-3">
        <span
          className="border-border bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
          aria-hidden="true"
        >
          {state === "complete" ? <Check className="h-4 w-4" /> : number}
        </span>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-xs">{stateLabel}</p>
        </div>
      </div>
    </li>
  );
}

function getStatusCopy({
  state,
  delayed,
  pollingPaused,
  statusMessage,
}: {
  state: ProcessingState;
  delayed: boolean;
  pollingPaused: boolean;
  statusMessage: string | null;
}) {
  if (pollingPaused) {
    return {
      title: "Automatic checking paused",
      description:
        statusMessage ??
        "Your interview remains saved. Check again when you’re ready, or return later from Interview history.",
    };
  }
  if (statusMessage) {
    return {
      title: delayed ? "Processing is taking longer" : getStageTitle(state),
      description: statusMessage,
    };
  }
  if (state === "settling") {
    return {
      title: delayed ? "Interview saving is delayed" : "Saving your interview",
      description: delayed
        ? "The saved interview handoff is taking longer. Finalized evidence remains protected while recovery continues."
        : "We’re finalizing the saved transcript before feedback begins.",
    };
  }
  if (state === "pending") {
    return {
      title: delayed ? "Feedback queue is delayed" : "Feedback queued",
      description: delayed
        ? "The review has not started on time, but your interview remains saved."
        : "Your saved interview is waiting for feedback review.",
    };
  }
  return {
    title: delayed ? "Feedback is taking longer" : "Reviewing your interview",
    description: delayed
      ? "Feedback is still being prepared from finalized saved evidence."
      : "We’re preparing feedback from the finalized saved interview evidence.",
  };
}

function getStageTitle(state: ProcessingState) {
  if (state === "settling") return "Saving your interview";
  if (state === "pending") return "Feedback queued";
  return "Reviewing your interview";
}

function getRecoveryLabel(state: ProcessingState) {
  if (state === "settling") return "Retry saving";
  if (state === "pending") return "Queue feedback";
  return "Restart review";
}

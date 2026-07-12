"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Orb } from "@/components/ui/orb";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, X, Loader2, RefreshCw } from "lucide-react";
import { fadeInUp } from "@/lib/animations";
import {
  FeedbackActionItem,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";

interface Stage {
  label: string;
  threshold: number; // Progress % when stage completes
}

const stages: Stage[] = [
  { label: "Transcript processed", threshold: 10 },
  { label: "Evaluating structure", threshold: 30 },
  { label: "Scoring competencies", threshold: 60 },
  { label: "Generating recommendations", threshold: 85 },
];

const messages = [
  "Your interview coach is reviewing your responses...",
  "Analyzing framework adherence and structure...",
  "Evaluating clarity and depth of insights...",
  "Identifying your strongest moments...",
  "Finding opportunities for growth...",
  "Almost there! Finalizing your personalized feedback...",
];

interface FeedbackLoadingProps {
  sessionId: string;
}

export function FeedbackLoading({ sessionId }: FeedbackLoadingProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [status, setStatus] = useState<
    "settling" | "pending" | "processing" | "completed" | "failed" | "skipped"
  >("pending");
  const [error, setError] = useState<string | null>(null);
  const [retryMode, setRetryMode] = useState<"dispatch" | "poll" | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [, setPollCount] = useState(0);

  const MAX_POLLS = 30; // 30 polls * 3s = 90s timeout

  // Polling effect - useCallback without dependencies that change on every poll
  const pollFeedback = useCallback(async () => {
    try {
      const res = await fetch(`/api/feedback/${sessionId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || data.error || "Could not check feedback status."
        );
      }

      if (data.status === "missing" || data.dispatch?.retryable) {
        setStatus("failed");
        setRetryMode("dispatch");
        setError(
          data.message ||
            "Your interview is saved, but feedback still needs to be queued."
        );
        return;
      }

      if (data.status === "settling") {
        setStatus("settling");
        setError(null);
        return;
      }

      if (data.status === "completed" && data.feedback) {
        console.log(
          "[FeedbackLoading] Feedback complete, redirecting to feedback page"
        );
        setStatus("completed");
        setProgress(100); // Set to 100% before redirect
        // Small delay to show 100% completion, then redirect
        setTimeout(() => {
          router.replace(`/feedback/${sessionId}`);
        }, 500);
        return;
      }

      if (data.status === "failed") {
        console.error(
          "[FeedbackLoading] Feedback generation failed:",
          data.error
        );
        setStatus("failed");
        setRetryMode(data.retryable ? "dispatch" : null);
        setError(data.error || "Feedback generation failed.");
        return;
      }

      if (data.status === "skipped") {
        console.log("[FeedbackLoading] Feedback was skipped");
        setStatus("skipped");
        setError("Feedback generation was skipped for this session.");
        return;
      }

      // Only update state if still processing
      setStatus(data.status);

      // Update poll count, check timeout, and update progress
      setPollCount((prevCount) => {
        const newCount = prevCount + 1;

        console.log(
          `[FeedbackLoading] Polling feedback status (attempt ${newCount}/${MAX_POLLS})`
        );
        console.log("[FeedbackLoading] Poll response:", data);

        // Check for timeout
        if (newCount >= MAX_POLLS) {
          console.error("[FeedbackLoading] Timeout reached after 90 seconds");
          setStatus("failed");
          setRetryMode("poll");
          setError(
            "Feedback generation timed out after 90 seconds. Please try again."
          );
        }

        // Update progress
        const elapsed = (newCount - 1) * 3; // Time elapsed before this poll
        const estimatedTotal = 60;
        const calculatedProgress = Math.min(
          95,
          (elapsed / estimatedTotal) * 100
        );
        setProgress((prev) => Math.max(prev, calculatedProgress));

        return newCount;
      });
    } catch (err) {
      console.error("[FeedbackLoading] Error polling feedback:", err);
      setStatus("failed");
      setRetryMode("poll");
      setError(
        err instanceof Error
          ? err.message
          : "Could not check feedback status. Please try again."
      );
    }
  }, [sessionId, router]);

  // Start polling on mount
  useEffect(() => {
    // Don't poll if already in terminal state
    if (status === "completed" || status === "failed" || status === "skipped") {
      return;
    }

    // Initial poll
    pollFeedback();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      pollFeedback();
    }, 3000);

    return () => clearInterval(interval);
  }, [pollFeedback, status]);

  // Stop polling when terminal state is reached
  useEffect(() => {
    if (status === "completed" || status === "failed" || status === "skipped") {
      // Force a re-render to ensure redirect happens
      console.log("[FeedbackLoading] Terminal state reached:", status);
    }
  }, [status]);

  // Message rotation (every 5s)
  useEffect(() => {
    if (
      status !== "settling" &&
      status !== "pending" &&
      status !== "processing"
    )
      return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [status]);

  // Stage progression based on progress
  useEffect(() => {
    const newStage = stages.findIndex((s) => progress < s.threshold);
    if (newStage !== -1) {
      setCurrentStage(newStage);
    } else {
      setCurrentStage(stages.length);
    }
  }, [progress]);

  const handleRetry = async () => {
    if (retryMode === "poll") {
      setError(null);
      setRetryMode(null);
      setStatus("pending");
      setPollCount(0);
      return;
    }
    if (retryMode !== "dispatch") return;

    setIsRetrying(true);
    setError(null);

    try {
      const response = await fetch(`/api/feedback/${sessionId}`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message || "Failed to queue feedback. Please try again."
        );
      }
      if (data?.status === "failed") {
        setRetryMode(null);
        throw new Error(
          data.error || "Feedback generation failed and cannot be requeued."
        );
      }

      setRetryMode(null);
      setStatus("pending");
      setPollCount(0);
      setProgress(0);
      setCurrentStage(0);
      setMessageIndex(0);
    } catch (err) {
      console.error("[FeedbackLoading] Error retrying feedback:", err);
      setError(
        err instanceof Error ? err.message : "Failed to regenerate feedback"
      );
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  // Render error state
  if (status === "failed" || (error && status !== "skipped")) {
    return (
      <FeedbackStatusPage
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title={
          retryMode === "dispatch"
            ? "Feedback Is Waiting to Start"
            : retryMode === "poll"
              ? "Status Check Failed"
              : "Generation Failed"
        }
        description={
          error ||
          "An unexpected error occurred while generating your feedback."
        }
        actions={
          <>
            {retryMode && (
              <Button onClick={handleRetry} disabled={isRetrying}>
                {isRetrying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrying
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {retryMode === "dispatch"
                      ? "Queue Feedback"
                      : "Check Again"}
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={handleSkip}>
              Skip
            </Button>
          </>
        }
      />
    );
  }

  // Render skipped state
  if (status === "skipped") {
    return (
      <FeedbackStatusPage
        tone="warning"
        icon={<X className="h-8 w-8" />}
        title="Feedback Skipped"
        description="Feedback generation was skipped for this session. You can start a new interview from the dashboard."
        actions={
          <Button onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        }
      />
    );
  }

  // Render loading state
  return (
    <FeedbackStatusPage
      tone="info"
      icon={<Loader2 className="h-8 w-8 animate-spin" />}
      title="Generating Feedback"
      description={
        status === "settling"
          ? "Your interview is saved. We’re closing the room safely before feedback begins."
          : "Your personalized interview review is being prepared."
      }
      maxWidth="lg"
      contentClassName="max-w-4xl"
    >
      <motion.div initial="initial" animate="animate" variants={fadeInUp}>
        <FeedbackSectionCard
          title="Analyzing your interview"
          description="You can leave this page and return when your review is ready."
          tone="info"
          action={
            <span className="text-primary text-sm font-medium">
              {Math.round(progress)}%
            </span>
          }
          contentClassName="space-y-8"
        >
          <div className="mx-auto h-44 w-full max-w-44">
            <Orb
              agentState="thinking"
              volumeMode="manual"
              manualInput={0.5}
              manualOutput={0.6}
              className="h-full w-full"
            />
          </div>

          <div
            className="flex min-h-16 items-center justify-center text-center"
            aria-live="polite"
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-foreground/80 text-lg"
              >
                {messages[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground text-sm font-medium">
                Progress
              </span>
              <span className="text-primary text-sm font-medium">
                {Math.round(progress)}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Feedback generation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="bg-muted h-2 overflow-hidden rounded-full"
            >
              <motion.div
                className="from-primary via-primary/80 to-primary h-full bg-gradient-to-r"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          <ul className="space-y-3">
            {stages.map((stage, index) => {
              const isComplete = currentStage > index;
              const isCurrent = currentStage === index;

              return (
                <FeedbackActionItem
                  key={stage.label}
                  tone={isComplete ? "success" : isCurrent ? "info" : "default"}
                  marker={
                    isComplete ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      index + 1
                    )
                  }
                  title={stage.label}
                >
                  {isComplete
                    ? "Complete"
                    : isCurrent
                      ? "In progress"
                      : "Waiting"}
                </FeedbackActionItem>
              );
            })}
          </ul>
        </FeedbackSectionCard>
      </motion.div>
    </FeedbackStatusPage>
  );
}

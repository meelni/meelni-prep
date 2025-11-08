"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Orb } from "@/components/ui/orb";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, X, Loader2, RefreshCw } from "lucide-react";
import { fadeInUp, scaleIn, progressBar } from "@/lib/animations";

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
  const [estimatedTime, setEstimatedTime] = useState(45);
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed" | "skipped">("pending");
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const MAX_POLLS = 30; // 30 polls * 3s = 90s timeout

  // Polling effect
  const pollFeedback = useCallback(async () => {
    try {
      console.log(`[FeedbackLoading] Polling feedback status (attempt ${pollCount + 1}/${MAX_POLLS})`);
      const res = await fetch(`/api/feedback/${sessionId}`);
      const data = await res.json();

      console.log("[FeedbackLoading] Poll response:", data);

      setStatus(data.status);

      if (data.status === "completed" && data.feedback) {
        console.log("[FeedbackLoading] Feedback complete, redirecting to feedback page");
        // Slight delay for smooth transition
        setTimeout(() => {
          router.push(`/feedback/${sessionId}`);
        }, 800);
        return;
      }

      if (data.status === "failed") {
        console.error("[FeedbackLoading] Feedback generation failed:", data.error);
        setError(data.error || "Feedback generation failed. Please try again.");
        return;
      }

      if (data.status === "skipped") {
        console.log("[FeedbackLoading] Feedback was skipped");
        setError("Feedback generation was skipped for this session.");
        return;
      }

      // Update estimated time if provided
      if (data.estimatedTimeRemaining !== undefined) {
        setEstimatedTime(Math.max(0, data.estimatedTimeRemaining));
      }

      // Update progress (simulated based on elapsed time)
      const elapsed = pollCount * 3; // 3s per poll
      const estimatedTotal = 60; // Assume ~60s total
      const calculatedProgress = Math.min(95, (elapsed / estimatedTotal) * 100);
      setProgress(Math.max(progress, calculatedProgress));

      setPollCount((prev) => prev + 1);
    } catch (err) {
      console.error("[FeedbackLoading] Error polling feedback:", err);
      if (pollCount >= MAX_POLLS) {
        setStatus("failed");
        setError("Feedback generation timed out. Please refresh to try again.");
      }
    }
  }, [sessionId, router, pollCount, progress]);

  // Start polling on mount
  useEffect(() => {
    // Initial poll
    pollFeedback();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      if (status === "pending" || status === "processing") {
        if (pollCount < MAX_POLLS) {
          pollFeedback();
        } else {
          clearInterval(interval);
          setStatus("failed");
          setError("Feedback generation timed out after 90 seconds. Please try again.");
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pollFeedback, status, pollCount]);

  // Message rotation (every 5s)
  useEffect(() => {
    if (status !== "pending" && status !== "processing") return;

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
    setIsRetrying(true);
    setError(null);
    setStatus("pending");
    setPollCount(0);
    setProgress(0);
    setCurrentStage(0);
    setMessageIndex(0);

    // Trigger feedback generation
    try {
      const response = await fetch(`/api/feedback/${sessionId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to regenerate feedback");
      }

      // Reset and start polling again
      setIsRetrying(false);
    } catch (err) {
      console.error("[FeedbackLoading] Error retrying feedback:", err);
      setError(err instanceof Error ? err.message : "Failed to regenerate feedback");
      setIsRetrying(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  // Render error state
  if (status === "failed" || error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          className="max-w-md w-full"
          initial="initial"
          animate="animate"
          variants={fadeInUp}
        >
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <motion.div
              className="w-16 h-16 mx-auto mb-6 bg-destructive/10 rounded-full flex items-center justify-center"
              variants={scaleIn}
            >
              <AlertCircle className="w-8 h-8 text-destructive" />
            </motion.div>
            <h1 className="text-2xl font-bold mb-3">Generation Failed</h1>
            <p className="text-muted-foreground mb-6">
              {error || "An unexpected error occurred while generating your feedback."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Retrying...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSkip}
                className="flex-1 px-6 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render skipped state
  if (status === "skipped") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          className="max-w-md w-full"
          initial="initial"
          animate="animate"
          variants={fadeInUp}
        >
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <motion.div
              className="w-16 h-16 mx-auto mb-6 bg-amber-500/10 rounded-full flex items-center justify-center"
              variants={scaleIn}
            >
              <X className="w-8 h-8 text-amber-500" />
            </motion.div>
            <h1 className="text-2xl font-bold mb-3">Feedback Skipped</h1>
            <p className="text-muted-foreground mb-6">
              Feedback generation was skipped for this session. You can start a new interview from the dashboard.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render loading state
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        className="max-w-2xl w-full"
        initial="initial"
        animate="animate"
        variants={fadeInUp}
      >
        {/* Animated Orb */}
        <div className="w-full max-w-[200px] h-[200px] mx-auto mb-8">
          <Orb
            agentState="thinking"
            volumeMode="manual"
            manualInput={0.5}
            manualOutput={0.6}
            className="w-full h-full"
          />
        </div>

        {/* Rotating Messages */}
        <div className="mb-8 text-center h-16 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="text-lg text-foreground/80"
            >
              {messages[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Analyzing your interview...
            </span>
            <span className="text-sm font-medium text-primary">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stages */}
        <div className="space-y-4 mb-8">
          {stages.map((stage, index) => {
            const isComplete = currentStage > index;
            const isCurrent = currentStage === index;

            return (
              <motion.div
                key={stage.label}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                      ? "bg-primary/20 border-2 border-primary"
                      : "bg-muted border-2 border-border"
                  }`}
                >
                  {isComplete ? (
                    <Check className="w-4 h-4" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`text-sm font-medium transition-colors ${
                    isComplete || isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {stage.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Estimated Time */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Estimated time remaining:{" "}
            <span className="font-medium text-primary">
              {estimatedTime > 0 ? `${estimatedTime}s` : "Almost done..."}
            </span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Feedback Error Component
 *
 * Displayed when feedback generation fails (GPT-4 timeout, API error, etc.).
 * Provides retry functionality and support links.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface FeedbackErrorProps {
  error: string;
  sessionId: string;
  onRetry?: () => Promise<void>;
}

export function FeedbackError({
  error,
  sessionId,
  onRetry,
}: FeedbackErrorProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    
    setRetrying(true);
    try {
      await onRetry();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md space-y-6">
        {/* Error Icon */}
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-display font-light mb-2">
            Feedback Generation Failed
          </h1>
          <p className="text-muted-foreground">
            Something went wrong while analyzing your interview.
          </p>
        </div>

        {/* Error Details Card */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm mb-2">
            <strong className="text-foreground">Error:</strong>{" "}
            <span className="text-muted-foreground">{error}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Don't worry - your interview transcript is saved. You can retry
            feedback generation or come back later.
          </p>
        </div>

        {/* Session Info */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">Session ID</span>
            <span className="text-xs font-mono text-muted-foreground">
              {sessionId.slice(0, 8)}...
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            asChild
            disabled={retrying}
            className="flex-1"
          >
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
          {onRetry && (
            <Button
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1"
            >
              {retrying ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Feedback
                </>
              )}
            </Button>
          )}
        </div>

        {/* Alternative Actions */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            What you can do:
          </p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <Link
                  href={`/interview/${sessionId}/transcript`}
                  className="text-primary hover:underline"
                >
                  View your transcript
                </Link>{" "}
                to review your responses
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <Link
                  href="/setup"
                  className="text-primary hover:underline"
                >
                  Start a new interview
                </Link>{" "}
                to practice again
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Wait a few minutes and try the retry button above</span>
            </li>
          </ul>
        </div>

        {/* Support Link */}
        <div className="text-center text-sm text-muted-foreground">
          Still having issues?{" "}
          <Link href="/support" className="text-primary hover:underline">
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}

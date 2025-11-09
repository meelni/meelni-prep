/**
 * Feedback Insufficient Component
 *
 * Displayed when a session is too short or has insufficient data to generate
 * meaningful feedback. Shows actual stats vs. requirements and provides
 * actionable next steps.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface SessionStats {
  durationSeconds: number;
  durationMinutes: number;
  userTurns: number;
  totalTurns: number;
  totalWords?: number;
}

interface FeedbackInsufficientProps {
  sessionId: string;
  stats: SessionStats;
  skipReason?: string;
}

export function FeedbackInsufficient({
  sessionId,
  stats,
  skipReason,
}: FeedbackInsufficientProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md space-y-6">
        {/* Icon & Title */}
        <div className="text-center">
          <div className="text-6xl mb-4">🕒</div>
          <h1 className="text-2xl font-display font-light mb-2">
            Session Too Short
          </h1>
          <p className="text-muted-foreground">
            {skipReason ||
              "We need at least 3 minutes and a few exchanges to provide meaningful feedback."}
          </p>
        </div>

        {/* Stats Card */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">Session Duration</span>
            <span className="text-sm font-mono text-muted-foreground">
              {Math.floor(stats.durationSeconds / 60)}m {stats.durationSeconds % 60}s
              <span className="text-xs ml-1">/ 3m required</span>
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">User Responses</span>
            <span className="text-sm font-mono text-muted-foreground">
              {stats.userTurns}
              <span className="text-xs ml-1">/ 3 required</span>
            </span>
          </div>
          {stats.totalWords !== undefined && (
            <>
              <div className="h-px bg-border" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground">Total Words</span>
                <span className="text-sm font-mono text-muted-foreground">
                  {stats.totalWords}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="outline" asChild className="flex-1">
            <Link href={`/interview/${sessionId}/transcript`}>
              View Transcript
            </Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href="/setup">Start New Interview</Link>
          </Button>
        </div>

        {/* Tip Card */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm text-foreground">
            💡 <strong>Tip:</strong> Aim for 10+ minute interviews to get
            comprehensive feedback on your performance. Practice answering
            follow-up questions in depth.
          </p>
        </div>

        {/* Back to Dashboard Link */}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

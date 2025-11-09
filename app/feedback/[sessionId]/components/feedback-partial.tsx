/**
 * Feedback Partial Component
 *
 * Displayed when a session meets minimum requirements but is shorter than ideal (5-15 minutes).
 * Shows available feedback with a warning banner explaining limited comprehensiveness.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBreakdown } from "@/components/feedback/score-breakdown";
import { StrengthsList } from "@/components/feedback/strengths-list";
import { ImprovementsList } from "@/components/feedback/improvements-list";
import type { EvaluationResponse } from "@/lib/types/feedback";

interface SessionStats {
  durationSeconds: number;
  durationMinutes: number;
  userTurns: number;
  totalTurns: number;
  totalWords?: number;
}

interface FeedbackPartialProps {
  feedback: EvaluationResponse;
  stats: SessionStats;
  sessionId: string;
}

export function FeedbackPartial({
  feedback,
  stats,
  sessionId,
}: FeedbackPartialProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto p-6 space-y-6">
        {/* Warning Banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <h3 className="font-medium mb-1 flex items-center gap-2">
            <span>⚠️</span>
            <span>Partial Feedback</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            Your session was shorter than recommended ({stats.durationMinutes}{" "}
            minutes). Feedback may be less comprehensive. For best results, aim
            for 20+ minute sessions with 10+ exchanges.
          </p>
        </div>

        {/* Session Stats */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-mono text-muted-foreground">
                  {stats.durationMinutes}m
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Duration
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono text-muted-foreground">
                  {stats.userTurns}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Responses
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono text-muted-foreground">
                  {stats.totalWords || "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Words</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-card via-card to-card/80 border-primary/20">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Overall Assessment
                  </h2>
                  <p className="text-sm text-foreground leading-relaxed">
                    {feedback.summary}
                  </p>
                </div>
                <div className="text-right ml-8">
                  <div className="text-5xl font-display font-light text-primary mb-1">
                    {feedback.scores.overall.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    out of 10
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Breakdown */}
        {feedback.scores && <ScoreBreakdown scores={feedback.scores} />}

        {/* Strengths and Improvements Grid */}
        {(feedback.strengths.length > 0 ||
          feedback.improvements.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {feedback.strengths.length > 0 && (
              <StrengthsList strengths={feedback.strengths} />
            )}
            {feedback.improvements.length > 0 && (
              <ImprovementsList improvements={feedback.improvements} />
            )}
          </div>
        )}

        {/* CTA to try again */}
        <Card className="bg-card border border-border">
          <CardContent className="p-6 text-center">
            <h3 className="font-display mb-2 text-lg">
              Want More Detailed Feedback?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Complete a full 20+ minute interview for comprehensive analysis
              with practice drills and detailed rubric scores.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link href="/dashboard">Back to Dashboard</Link>
              </Button>
              <Button asChild>
                <Link href="/setup">Start Full Interview</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

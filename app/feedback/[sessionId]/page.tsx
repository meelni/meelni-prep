"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Share2, Calendar, Loader2, GitCompare } from "lucide-react";
import { ScoreBreakdown } from "@/components/feedback/score-breakdown";
import { RubricSection } from "@/components/feedback/rubric-section";
import { StrengthsList } from "@/components/feedback/strengths-list";
import { ImprovementsList } from "@/components/feedback/improvements-list";
import { DrillList } from "@/components/feedback/drill-list";
import { TranscriptViewer } from "@/components/feedback/transcript-viewer";
import { FeedbackLoading } from "./components/feedback-loading";
import type { EvaluationResponse, TranscriptTurn } from "@/lib/types/feedback";
import Link from "next/link";

// Error state component
function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="p-8 text-center max-w-md">
        <p className="text-destructive mb-4 font-display font-light text-lg">
          Failed to load feedback
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {error || "An unexpected error occurred"}
        </p>
        <Button asChild>
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </Card>
    </div>
  );
}

export default function FeedbackPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed" | "skipped">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkFeedbackStatus() {
      try {
        // First check feedback status via polling API
        const statusResponse = await fetch(`/api/feedback/${sessionId}`);

        if (!statusResponse.ok) {
          const errorData = await statusResponse.json().catch(() => ({ error: statusResponse.statusText }));
          throw new Error(errorData.error || `Failed to fetch feedback status: ${statusResponse.statusText}`);
        }

        const statusData = await statusResponse.json();
        setStatus(statusData.status);

        // If completed, load full feedback
        if (statusData.status === "completed" && statusData.feedback) {
          setEvaluation({
            session_id: sessionId,
            scores: {
              overall: statusData.feedback.overallScore,
              structure: statusData.feedback.structureScore,
              clarity: statusData.feedback.clarityScore,
              insight: statusData.feedback.insightScore,
              communication: statusData.feedback.communicationScore,
              leadership: statusData.feedback.leadershipScore,
            },
            strengths: statusData.feedback.strengths,
            improvements: statusData.feedback.improvements,
            drills: statusData.feedback.drills,
            summary: statusData.feedback.summary,
          });
        } else if (statusData.status === "failed") {
          setError(statusData.error || "Feedback generation failed");
        } else if (statusData.status === "skipped") {
          setError(statusData.skipReason || "Feedback generation was skipped");
        }

        // TODO: Fetch transcript from separate endpoint when available
        setTranscript([]);
      } catch (err) {
        console.error("Error fetching feedback:", err);
        setError(err instanceof Error ? err.message : "Failed to load feedback");
        setStatus("failed");
      }
    }

    checkFeedbackStatus();
  }, [sessionId]);

  // Show loading component for pending/processing states
  if (status === "pending" || status === "processing") {
    return <FeedbackLoading sessionId={sessionId} />;
  }

  // Show error state
  if (error || !evaluation) {
    return <ErrorState error={error} />;
  }

  const handleDownload = () => {
    alert("Download PDF feature coming soon!");
  };

  const handleShare = () => {
    alert("Share feedback feature coming soon!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="space-y-1">
                <h1 className="text-xl font-display font-light text-foreground">
                  Interview Feedback
                </h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Session {sessionId}</span>
                  <Badge variant="secondary" className="ml-2">
                    Product Sense
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/feedback/${sessionId}/compare`}>
                <Button variant="outline" size="sm">
                  <GitCompare className="w-4 h-4 mr-2" />
                  Compare Attempts
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-8">
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
                      {evaluation.summary}
                    </p>
                  </div>
                  <div className="text-right ml-8">
                    <div className="text-5xl font-display font-light text-primary mb-1">
                      {evaluation.scores.overall.toFixed(1)}
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
          <ScoreBreakdown scores={evaluation.scores} />

          {/* Rubric Cards */}
          <div className="space-y-3">
            <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Detailed Scores
            </h2>
            <RubricSection scores={evaluation.scores} />
          </div>

          {/* Strengths and Improvements Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StrengthsList strengths={evaluation.strengths} />
            <ImprovementsList improvements={evaluation.improvements} />
          </div>

          {/* Practice Drills */}
          <DrillList drills={evaluation.drills} />

          {/* Transcript */}
          {transcript.length > 0 ? (
            <TranscriptViewer transcript={transcript} />
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Transcript will be available once session recording is complete
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

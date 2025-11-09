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
import type { EvaluationResponse, TranscriptTurn } from "@/lib/types/feedback";
import Link from "next/link";

// Import edge case components
import { FeedbackInsufficient } from "./components/feedback-insufficient";
import { FeedbackPartial } from "./components/feedback-partial";
import { FeedbackError } from "./components/feedback-error";

// Session stats type for edge cases
interface SessionStats {
  durationSeconds: number;
  durationMinutes: number;
  userTurns: number;
  totalTurns: number;
  totalWords?: number;
}

// API response type with status handling
interface FeedbackAPIResponse {
  status?: "pending" | "processing" | "completed" | "skipped" | "failed";
  skipReason?: string;
  error?: string;
  stats?: SessionStats;
  feedback?: EvaluationResponse;
}

// Loading state component
function LoadingState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="p-8 text-center">
        <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p className="text-foreground font-display font-light mb-2">
          Generating Feedback
        </p>
        <p className="text-sm text-muted-foreground">
          Analyzing your interview performance...
        </p>
      </Card>
    </div>
  );
}

export default function FeedbackPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [skipReason, setSkipReason] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    async function fetchFeedback() {
      try {
        setLoading(true);

        // Call evaluation API
        const response = await fetch(`/api/eval/${sessionId}`, {
          method: "POST",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          // Handle specific 400 errors for insufficient data
          if (response.status === 400 && errorData.error?.includes("empty transcript")) {
            setStatus("skipped");
            setSkipReason(errorData.error);
            setStats({
              durationSeconds: 0,
              durationMinutes: 0,
              userTurns: 0,
              totalTurns: 0,
            });
            return;
          }
          throw new Error(errorData.error || `Failed to fetch feedback: ${response.statusText}`);
        }

        const data: EvaluationResponse | FeedbackAPIResponse = await response.json();

        // Handle status-based responses from P1-005 polling API
        if ('status' in data) {
          const apiResponse = data as FeedbackAPIResponse;
          setStatus(apiResponse.status);

          if (apiResponse.status === "skipped") {
            setSkipReason(apiResponse.skipReason);
            setStats(apiResponse.stats || null);
            return;
          }

          if (apiResponse.status === "failed") {
            setError(apiResponse.error || "Feedback generation failed");
            return;
          }

          if (apiResponse.status === "completed" && apiResponse.feedback) {
            setEvaluation(apiResponse.feedback);
            setStats(apiResponse.stats || null);
          }
        } else {
          // Legacy format: direct evaluation response
          setEvaluation(data as EvaluationResponse);
        }

        // TODO: Fetch transcript from separate endpoint when WS #3 completes
        // For now, use empty transcript
        setTranscript([]);
      } catch (err) {
        console.error("Error fetching feedback:", err);
        setError(err instanceof Error ? err.message : "Failed to load feedback");
      } finally {
        setLoading(false);
      }
    }

    fetchFeedback();
  }, [sessionId]);

  // Retry function for error state
  const handleRetry = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/eval/${sessionId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Retry failed");
      }

      const data = await response.json();
      setEvaluation(data);
      setStatus("completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  };

  // Route to appropriate component based on status
  if (loading || status === "pending" || status === "processing") {
    return <LoadingState />;
  }

  if (status === "skipped" || (error && error.includes("empty transcript"))) {
    return (
      <FeedbackInsufficient
        sessionId={sessionId}
        stats={stats || {
          durationSeconds: 0,
          durationMinutes: 0,
          userTurns: 0,
          totalTurns: 0,
        }}
        skipReason={skipReason}
      />
    );
  }

  if (status === "failed" || error) {
    return (
      <FeedbackError
        error={error || "Unknown error occurred"}
        sessionId={sessionId}
        onRetry={handleRetry}
      />
    );
  }

  if (!evaluation) {
    return (
      <FeedbackError
        error="No feedback data available"
        sessionId={sessionId}
        onRetry={handleRetry}
      />
    );
  }

  // Check for partial feedback (short session with some feedback)
  if (stats && stats.durationMinutes < 15 && stats.durationMinutes >= 3) {
    return (
      <FeedbackPartial
        feedback={evaluation}
        stats={stats}
        sessionId={sessionId}
      />
    );
  }

  // Full feedback display (standard success case)
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

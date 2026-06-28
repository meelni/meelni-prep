"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  TrendingUp,
  Target,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

import {
  FeedbackActionItem,
  FeedbackScoreCard,
  FeedbackSectionCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";

interface FeedbackData {
  id: string;
  sessionId: string;
  structureScore: number | null;
  clarityScore: number | null;
  insightScore: number | null;
  communicationScore: number | null;
  leadershipScore: number | null;
  overallScore: number | null;
  strengths: string[];
  improvements: string[];
  drills: string[];
  summary: string | null;
  rubricVersion: string;
  createdAt: string;
}

interface FeedbackResponse {
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  feedback?: FeedbackData;
  estimatedTimeRemaining?: number;
  error?: string;
  skipReason?: string;
}

interface TranscriptTurn {
  id: string;
  sessionId: string;
  speaker: "user" | "interviewer";
  startedAt: string | null;
  endedAt: string | null;
  text: string | null;
  audioMs: number | null;
  latencyMs: number | null;
  section: string | null;
}

interface TranscriptResponse {
  turns: TranscriptTurn[];
}

function LoadingSkeleton() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="bg-muted mb-4 h-8 w-32 animate-pulse rounded" />
          <div className="bg-muted h-12 w-64 animate-pulse rounded" />
        </div>

        <div className="mb-8">
          <FeedbackSectionCard
            title={<div className="bg-muted h-6 w-40 animate-pulse rounded" />}
          >
            <div className="flex items-center justify-center py-8">
              <div className="bg-muted h-32 w-32 animate-pulse rounded-full" />
            </div>
          </FeedbackSectionCard>
        </div>

        <FeedbackSectionCard
          title={<div className="bg-muted h-6 w-48 animate-pulse rounded" />}
          contentClassName="space-y-6"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="bg-muted h-5 w-32 animate-pulse rounded" />
              <div className="bg-muted h-2 w-full animate-pulse rounded" />
            </div>
          ))}
        </FeedbackSectionCard>
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-yellow-500";
  return "text-red-500";
}

function getProgressColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

export default function FeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [feedbackData, setFeedbackData] = useState<FeedbackResponse | null>(
    null
  );
  const [transcriptData, setTranscriptData] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    async function fetchFeedback() {
      try {
        const response = await fetch(`/api/feedback/${sessionId}`);

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/auth/signin");
            return;
          }
          throw new Error("Failed to fetch feedback");
        }

        const data: FeedbackResponse = await response.json();
        setFeedbackData(data);

        // If still processing, poll again
        if (data.status === "pending" || data.status === "processing") {
          setTimeout(fetchFeedback, 3000); // Poll every 3 seconds
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load feedback"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchFeedback();
  }, [sessionId, router]);

  // Fetch transcript when expanded
  useEffect(() => {
    if (!transcriptExpanded || transcriptData.length > 0 || !sessionId) return;

    async function fetchTranscript() {
      setLoadingTranscript(true);
      try {
        const response = await fetch(`/api/transcript/${sessionId}`);

        if (!response.ok) {
          throw new Error("Failed to fetch transcript");
        }

        const data: TranscriptResponse = await response.json();
        setTranscriptData(data.turns);
      } catch (err) {
        console.error("Error fetching transcript:", err);
      } finally {
        setLoadingTranscript(false);
      }
    }

    fetchTranscript();
  }, [transcriptExpanded, sessionId, transcriptData.length]);

  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <FeedbackStatusPage
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title="Feedback Unavailable"
        description={error}
        actions={
          <Button onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Button>
        }
      />
    );
  }

  // Processing state
  if (
    feedbackData?.status === "pending" ||
    feedbackData?.status === "processing"
  ) {
    return (
      <FeedbackStatusPage
        icon={<Loader2 className="h-8 w-8 animate-spin" />}
        title={
          feedbackData.status === "pending"
            ? "Preparing Feedback"
            : "Generating Feedback"
        }
        description="Our AI is analyzing your interview performance..."
        actions={
          feedbackData.estimatedTimeRemaining !== undefined && (
            <p className="text-muted-foreground text-sm">
              Estimated time remaining: {feedbackData.estimatedTimeRemaining}{" "}
              seconds
            </p>
          )
        }
      />
    );
  }

  // Failed state
  if (feedbackData?.status === "failed") {
    return (
      <FeedbackStatusPage
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title="Feedback Generation Failed"
        description={
          feedbackData.error ||
          "Something went wrong while generating feedback."
        }
        actions={
          <Button onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        }
      />
    );
  }

  // Skipped state
  if (feedbackData?.status === "skipped") {
    return (
      <FeedbackStatusPage
        tone="warning"
        icon={<AlertCircle className="h-8 w-8" />}
        title="Feedback Not Available"
        description={
          feedbackData.skipReason ||
          "This session is not eligible for feedback."
        }
        actions={
          <Button onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        }
      />
    );
  }

  // Completed state - show feedback
  const feedback = feedbackData?.feedback;
  if (!feedback) {
    return null;
  }

  const overallScore = feedback.overallScore || 0;
  const scorePercentage = (overallScore / 10) * 100; // Convert 0-10 scale to 0-100

  // Prepare dimension scores
  const dimensions = [
    { name: "Structure", score: feedback.structureScore },
    { name: "Clarity", score: feedback.clarityScore },
    { name: "Insight", score: feedback.insightScore },
    { name: "Communication", score: feedback.communicationScore },
    { name: "Leadership", score: feedback.leadershipScore },
  ];

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold">Interview Feedback</h1>
          <p className="text-muted-foreground mt-2">
            Detailed analysis of your performance
          </p>
        </div>

        {/* AI Summary */}
        {feedback.summary && (
          <div className="mb-8">
            <FeedbackSectionCard title="AI Summary">
              <p className="text-lg leading-relaxed">{feedback.summary}</p>
            </FeedbackSectionCard>
          </div>
        )}

        {/* Overall Score */}
        <div className="mb-8">
          <FeedbackScoreCard
            score={
              <span className={getScoreColor(scorePercentage)}>
                {overallScore.toFixed(1)}
              </span>
            }
            label="Overall Score"
            description="out of 10"
          />
        </div>

        {/* Dimension Scores */}
        <div className="mb-8">
          <FeedbackSectionCard
            title="Performance Breakdown"
            contentClassName="space-y-6"
          >
            {dimensions.map((dimension) => {
              const score = dimension.score || 0;
              const percentage = (score / 10) * 100;

              return (
                <div key={dimension.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dimension.name}</span>
                    <span
                      className={`font-semibold ${getScoreColor(percentage)}`}
                    >
                      {score}/10
                    </span>
                  </div>
                  <div className="relative">
                    <div className="bg-muted/30 h-2 w-full rounded-full" />
                    <div
                      className={`absolute inset-0 h-2 rounded-full ${getProgressColor(percentage)} transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </FeedbackSectionCard>
        </div>

        {/* Strengths */}
        {feedback.strengths && feedback.strengths.length > 0 && (
          <div className="mb-8">
            <FeedbackSectionCard
              title="What Went Well"
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="success"
            >
              <ul className="space-y-3">
                {feedback.strengths.map((strength, index) => (
                  <FeedbackActionItem
                    key={index}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    tone="success"
                  >
                    {strength}
                  </FeedbackActionItem>
                ))}
              </ul>
            </FeedbackSectionCard>
          </div>
        )}

        {/* Areas to Improve */}
        {feedback.improvements && feedback.improvements.length > 0 && (
          <div className="mb-8">
            <FeedbackSectionCard
              title="Areas to Improve"
              icon={<TrendingUp className="h-5 w-5" />}
              tone="warning"
            >
              <ul className="space-y-3">
                {feedback.improvements.map((improvement, index) => (
                  <FeedbackActionItem
                    key={index}
                    icon={<TrendingUp className="h-5 w-5" />}
                    tone="warning"
                  >
                    {improvement}
                  </FeedbackActionItem>
                ))}
              </ul>
            </FeedbackSectionCard>
          </div>
        )}

        {/* Practice Drills */}
        {feedback.drills && feedback.drills.length > 0 && (
          <div className="mb-8">
            <FeedbackSectionCard
              title="Practice Recommendations"
              icon={<Target className="h-5 w-5" />}
              tone="info"
            >
              <ul className="space-y-3">
                {feedback.drills.map((drill, index) => (
                  <FeedbackActionItem
                    key={index}
                    icon={<Target className="h-5 w-5" />}
                    tone="info"
                  >
                    {drill}
                  </FeedbackActionItem>
                ))}
              </ul>
            </FeedbackSectionCard>
          </div>
        )}

        {/* Interview Transcript */}
        <FeedbackSectionCard
          title="Interview Transcript"
          icon={<MessageSquare className="h-5 w-5" />}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
            >
              {transcriptExpanded ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Expand
                </>
              )}
            </Button>
          }
          className="mb-8"
        >
          {transcriptExpanded && (
            <>
              {loadingTranscript ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-primary h-8 w-8 animate-spin" />
                </div>
              ) : transcriptData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No transcript available for this session
                </p>
              ) : (
                <div className="space-y-4">
                  {transcriptData.map((turn) => (
                    <div
                      key={turn.id}
                      className={`flex ${turn.speaker === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          turn.speaker === "user"
                            ? "bg-primary/10 text-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-semibold tracking-wide uppercase">
                            {turn.speaker === "user" ? "You" : "Interviewer"}
                          </span>
                          {turn.startedAt && (
                            <span className="text-muted-foreground text-xs">
                              {formatTimestamp(turn.startedAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {turn.text || "(No text recorded)"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </FeedbackSectionCard>
      </div>
    </div>
  );
}

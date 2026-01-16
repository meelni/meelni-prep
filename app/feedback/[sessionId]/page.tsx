"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, CheckCircle2, TrendingUp, Target } from "lucide-react";

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

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="h-8 w-32 bg-muted animate-pulse rounded mb-4" />
          <div className="h-12 w-64 bg-muted animate-pulse rounded" />
        </div>

        {/* Overall Score Skeleton */}
        <Card className="mb-8">
          <CardHeader>
            <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="h-32 w-32 bg-muted animate-pulse rounded-full" />
            </div>
          </CardContent>
        </Card>

        {/* Dimension Scores Skeleton */}
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                <div className="h-2 w-full bg-muted animate-pulse rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
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

  const [feedbackData, setFeedbackData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : "Failed to load feedback");
      } finally {
        setLoading(false);
      }
    }

    fetchFeedback();
  }, [sessionId, router]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => router.push("/dashboard")} className="mt-4">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Processing state
  if (feedbackData?.status === "pending" || feedbackData?.status === "processing") {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-semibold mb-2">
                {feedbackData.status === "pending" ? "Preparing Feedback" : "Generating Feedback"}
              </h2>
              <p className="text-muted-foreground mb-4">
                Our AI is analyzing your interview performance...
              </p>
              {feedbackData.estimatedTimeRemaining !== undefined && (
                <p className="text-sm text-muted-foreground">
                  Estimated time remaining: {feedbackData.estimatedTimeRemaining} seconds
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Failed state
  if (feedbackData?.status === "failed") {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-red-500 mb-2">Feedback generation failed</p>
              <p className="text-muted-foreground text-sm">{feedbackData.error}</p>
              <Button onClick={() => router.push("/dashboard")} className="mt-4">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Skipped state
  if (feedbackData?.status === "skipped") {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-yellow-500 mb-2">Feedback Not Available</p>
              <p className="text-muted-foreground text-sm">{feedbackData.skipReason}</p>
              <Button onClick={() => router.push("/dashboard")} className="mt-4">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
          <Card className="mb-8 border-primary/20">
            <CardContent className="pt-6">
              <p className="text-lg leading-relaxed">{feedback.summary}</p>
            </CardContent>
          </Card>
        )}

        {/* Overall Score */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <div
                className={`text-7xl font-bold ${getScoreColor(scorePercentage)}`}
              >
                {overallScore.toFixed(1)}
              </div>
              <p className="text-muted-foreground mt-2">out of 10</p>
            </div>
          </CardContent>
        </Card>

        {/* Dimension Scores */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {dimensions.map((dimension) => {
              const score = dimension.score || 0;
              const percentage = (score / 10) * 100;

              return (
                <div key={dimension.name} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{dimension.name}</span>
                    <span className={`font-semibold ${getScoreColor(percentage)}`}>
                      {score}/10
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={percentage} className="h-2" />
                    <div
                      className={`absolute inset-0 h-2 rounded-full ${getProgressColor(percentage)} transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Strengths */}
        {feedback.strengths && feedback.strengths.length > 0 && (
          <Card className="mb-8 border-green-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                What Went Well
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {feedback.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-base">{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Areas to Improve */}
        {feedback.improvements && feedback.improvements.length > 0 && (
          <Card className="mb-8 border-orange-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <TrendingUp className="h-5 w-5" />
                Areas to Improve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {feedback.improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <span className="text-base">{improvement}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Practice Drills */}
        {feedback.drills && feedback.drills.length > 0 && (
          <Card className="mb-8 border-blue-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <Target className="h-5 w-5" />
                Practice Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {feedback.drills.map((drill, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Target className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span className="text-base">{drill}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

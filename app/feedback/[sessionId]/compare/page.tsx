"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AttemptComparison } from "@/components/feedback/attempt-comparison";
import {
  FeedbackReviewShell,
  FeedbackSectionCard,
  FeedbackStateCard,
  FeedbackStatusPage,
} from "@/components/feedback/feedback-surface";
import { SelectableCard } from "@/components/ui/selectable-card";
import { motion } from "framer-motion";
import { ArrowLeft, GitCompare, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { SessionAttempt, ComparisonData } from "@/lib/types/comparison";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

const roundTypeLabels: Record<string, string> = {
  product_sense: "Product Sense",
  analytical_thinking: "Analytical Thinking",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

export default function ComparePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [attempts, setAttempts] = useState<SessionAttempt[]>([]);
  const [roundType, setRoundType] = useState<string>("");
  const [selectedAttempt1, setSelectedAttempt1] = useState<string | null>(null);
  const [selectedAttempt2, setSelectedAttempt2] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available attempts
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
      return;
    }

    if (!user || !sessionId) return;

    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/feedback/${sessionId}/attempts`);
        if (!res.ok) {
          throw new Error("Failed to fetch attempts");
        }

        const data = await res.json();
        setAttempts(data.attempts || []);
        setRoundType(data.roundType || "");

        // Auto-select current session as attempt 2 (latest)
        setSelectedAttempt2(sessionId);
      } catch (err) {
        console.error("[Feedback Compare] attempts_fetch_failed", {
          code: "feedback_attempts_fetch_failed",
          ...toSafeErrorLog(err),
        });
        setError("Failed to load attempts");
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [user, authLoading, sessionId, router]);

  // Fetch comparison data when both attempts are selected
  useEffect(() => {
    if (!selectedAttempt1 || !selectedAttempt2) {
      setComparisonData(null);
      return;
    }

    const fetchComparison = async () => {
      try {
        setComparing(true);
        setError(null);

        const res = await fetch("/api/feedback/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId1: selectedAttempt1,
            sessionId2: selectedAttempt2,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to fetch comparison");
        }

        const data = await res.json();
        setComparisonData(data.comparison);
      } catch (err) {
        console.error("[Feedback Compare] comparison_fetch_failed", {
          code: "feedback_comparison_fetch_failed",
          ...toSafeErrorLog(err),
        });
        setError("Failed to load comparison data");
      } finally {
        setComparing(false);
      }
    };

    fetchComparison();
  }, [selectedAttempt1, selectedAttempt2]);

  // Loading state
  if (authLoading || loading) {
    return (
      <FeedbackStatusPage
        tone="info"
        icon={
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        }
        title="Loading Attempts"
        description="Finding sessions you can compare against this interview."
      />
    );
  }

  // Error state
  if (error && !attempts.length) {
    return (
      <FeedbackStatusPage
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title={error}
        description="We could not load the attempts for this feedback session."
        actions={
          <Link href={`/feedback/${sessionId}`}>
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Feedback
            </Button>
          </Link>
        }
      />
    );
  }

  // No other attempts available
  if (attempts.length < 2) {
    return (
      <FeedbackReviewShell
        title="Compare Attempts"
        description="Track how this round is changing across repeated practice."
        action={
          <Link href={`/feedback/${sessionId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Feedback
            </Button>
          </Link>
        }
      >
        <FeedbackStateCard
          icon={<GitCompare className="h-10 w-10" />}
          title="No Other Attempts Yet"
          description={`Complete more ${
            roundTypeLabels[roundType] || roundType
          } interviews to compare your progress and track improvements over time.`}
          action={
            <div className="flex justify-center gap-3">
              <Link href="/dashboard/new-interview">
                <Button>Start Another Interview</Button>
              </Link>
              <Link href={`/feedback/${sessionId}`}>
                <Button variant="outline">View Feedback</Button>
              </Link>
            </div>
          }
        />
      </FeedbackReviewShell>
    );
  }

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <FeedbackReviewShell
      title="Compare Attempts"
      description="Select two attempts to compare your progress and see how you've improved."
      maxWidth="xl"
      action={
        <Link href={`/feedback/${sessionId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Feedback
          </Button>
        </Link>
      }
    >
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-8"
      >
        {/* Page Header */}
        <motion.div variants={fadeInUp} className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary/10 text-primary border-primary/20">
              {roundTypeLabels[roundType] || roundType}
            </Badge>
            <Badge className="bg-muted/50 text-muted-foreground border-border/50">
              <GitCompare className="mr-1 h-3 w-3" />
              Comparison
            </Badge>
          </div>
        </motion.div>

        {/* Attempt Selection */}
        <motion.div variants={fadeInUp}>
          <FeedbackSectionCard
            title="Select Attempts to Compare"
            icon={<GitCompare className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Attempt 1 Selection */}
              <div className="space-y-3">
                <label className="text-foreground text-sm font-medium">
                  Earlier Attempt
                </label>
                <div className="space-y-2">
                  {attempts
                    .filter((attempt) => attempt.id !== selectedAttempt2)
                    .map((attempt) => (
                      <SelectableCard
                        key={attempt.id}
                        onClick={() => setSelectedAttempt1(attempt.id)}
                        selected={selectedAttempt1 === attempt.id}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <span className="text-foreground text-sm font-medium">
                            {formatDate(attempt.startedAt)}
                          </span>
                          {attempt.overallScore !== null && (
                            <Badge className="border-border/50 bg-muted/50 text-muted-foreground">
                              {attempt.overallScore}/10
                            </Badge>
                          )}
                        </div>
                        {attempt.overallScore === null && (
                          <span className="text-muted-foreground text-xs">
                            No feedback yet
                          </span>
                        )}
                      </SelectableCard>
                    ))}
                </div>
              </div>

              {/* Attempt 2 Selection (Current) */}
              <div className="space-y-3">
                <label className="text-foreground text-sm font-medium">
                  Latest Attempt
                </label>
                <div className="space-y-2">
                  {attempts
                    .filter((attempt) => attempt.id === selectedAttempt2)
                    .map((attempt) => (
                      <SelectableCard
                        key={attempt.id}
                        selected
                        disabled
                        className="cursor-default disabled:opacity-100"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <span className="text-foreground text-sm font-medium">
                            {formatDate(attempt.startedAt)}
                          </span>
                          {attempt.overallScore !== null && (
                            <Badge className="border-primary/20 bg-primary/10 text-primary">
                              {attempt.overallScore}/10
                            </Badge>
                          )}
                        </div>
                        <Badge className="border-primary/20 bg-primary/10 text-primary text-xs">
                          Current Session
                        </Badge>
                      </SelectableCard>
                    ))}
                </div>
              </div>
            </div>
          </FeedbackSectionCard>
        </motion.div>

        {/* Comparison Display */}
        {comparing && (
          <motion.div
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 py-12"
          >
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p className="text-muted-foreground text-sm">
              Loading comparison...
            </p>
          </motion.div>
        )}

        {!comparing && comparisonData && (
          <AttemptComparison comparison={comparisonData} />
        )}

        {!comparing && !comparisonData && selectedAttempt1 && (
          <motion.div variants={fadeInUp}>
            <FeedbackStateCard
              icon={<GitCompare className="h-10 w-10" />}
              title="Select Both Attempts"
              description="Select both attempts to view the comparison."
            />
          </motion.div>
        )}
      </motion.div>
    </FeedbackReviewShell>
  );
}

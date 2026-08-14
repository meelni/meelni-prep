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
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, GitCompare, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { SessionAttempt, ComparisonData } from "@/lib/types/comparison";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { buildFeedbackReauthenticationHref } from "./feedback-auth-navigation";
import { getDisplayedOverallScore } from "./score-presentation";

const roundTypeLabels: Record<string, string> = {
  product_sense: "Product Sense",
  analytical_thinking: "Analytical Thinking",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

function moveRadioSelection(event: KeyboardEvent<HTMLButtonElement>) {
  if (
    ![
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "End",
      "Home",
    ].includes(event.key)
  ) {
    return;
  }

  const group = event.currentTarget.closest('[role="radiogroup"]');
  const options = Array.from(
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []
  );
  const currentIndex = options.indexOf(event.currentTarget);
  if (currentIndex < 0 || options.length === 0) return;

  event.preventDefault();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;
  options[nextIndex]?.focus();
  options[nextIndex]?.click();
}

interface NoOtherAttemptsStateProps {
  roundType: string;
  sessionId: string;
}

export function NoOtherAttemptsState({
  roundType,
  sessionId,
}: NoOtherAttemptsStateProps) {
  return (
    <FeedbackReviewShell
      title="Compare Attempts"
      description="Track how this round is changing across repeated practice."
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href={`/feedback/${sessionId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Feedback
          </Link>
        </Button>
      }
    >
      <FeedbackStateCard
        icon={<GitCompare className="h-10 w-10" />}
        title="No Other Attempts Yet"
        description={`Complete more ${
          roundTypeLabels[roundType] || roundType
        } interviews to compare your progress and track improvements over time.`}
        action={
          <div className="flex min-w-0 flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              className="h-auto w-full max-w-full min-w-0 [overflow-wrap:anywhere] whitespace-normal sm:w-auto"
            >
              <Link href="/dashboard/new-interview">
                Start Another Interview
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto w-full max-w-full min-w-0 [overflow-wrap:anywhere] whitespace-normal sm:w-auto"
            >
              <Link href={`/feedback/${sessionId}`}>View Feedback</Link>
            </Button>
          </div>
        }
      />
    </FeedbackReviewShell>
  );
}

export function FeedbackComparisonReview() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const reauthenticationHref = buildFeedbackReauthenticationHref(
    sessionId,
    true
  );
  const shouldReduceMotion = useReducedMotion();

  const [attempts, setAttempts] = useState<SessionAttempt[]>([]);
  const [roundType, setRoundType] = useState<string>("");
  const [selectedAttempt1, setSelectedAttempt1] = useState<string | null>(null);
  const [selectedAttempt2, setSelectedAttempt2] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonRetryKey, setComparisonRetryKey] = useState(0);

  // Fetch available attempts
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(reauthenticationHref);
      return;
    }

    if (!user || !sessionId) return;

    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setAttemptsError(null);

        const res = await fetch(`/api/feedback/${sessionId}/attempts`);
        if (res.status === 401) {
          router.replace(reauthenticationHref);
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch attempts");
        }

        const data = await res.json();
        const loadedAttempts: SessionAttempt[] = (
          (data.attempts || []) as SessionAttempt[]
        ).filter((attempt) =>
          Number.isFinite(new Date(attempt.startedAt).getTime())
        );
        setAttempts(loadedAttempts);
        setRoundType(data.roundType || "");
        setSelectedAttempt1(null);
        setSelectedAttempt2(loadedAttempts[0]?.id ?? null);
      } catch (err) {
        console.error("[Feedback Compare] attempts_fetch_failed", {
          code: "feedback_attempts_fetch_failed",
          ...toSafeErrorLog(err),
        });
        setAttemptsError("Failed to load attempts");
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [user, authLoading, reauthenticationHref, sessionId, router]);

  // Fetch comparison data when both attempts are selected
  useEffect(() => {
    if (!selectedAttempt1 || !selectedAttempt2) {
      setComparisonData(null);
      setComparisonError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const fetchComparison = async () => {
      try {
        setComparing(true);
        setComparisonData(null);
        setComparisonError(null);

        const res = await fetch("/api/feedback/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId1: selectedAttempt1,
            sessionId2: selectedAttempt2,
          }),
        });

        if (res.status === 401) {
          router.replace(reauthenticationHref);
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch comparison");
        }

        const data = await res.json();
        if (active) setComparisonData(data.comparison);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        console.error("[Feedback Compare] comparison_fetch_failed", {
          code: "feedback_comparison_fetch_failed",
          ...toSafeErrorLog(err),
        });
        setComparisonError("We could not load this comparison.");
      } finally {
        if (active) setComparing(false);
      }
    };

    fetchComparison();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    comparisonRetryKey,
    reauthenticationHref,
    router,
    selectedAttempt1,
    selectedAttempt2,
  ]);

  // Loading state
  if (authLoading || loading) {
    return (
      <FeedbackStatusPage
        tone="info"
        role="status"
        aria-busy="true"
        icon={
          <div
            className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />
        }
        title="Loading Attempts"
        description="Finding sessions you can compare against this interview."
      />
    );
  }

  // Error state
  if (attemptsError && !attempts.length) {
    return (
      <FeedbackStatusPage
        tone="danger"
        icon={<AlertCircle className="h-8 w-8" />}
        title={attemptsError}
        description="We could not load the attempts for this feedback session."
        actions={
          <Button asChild>
            <Link href={`/feedback/${sessionId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Feedback
            </Link>
          </Button>
        }
      />
    );
  }

  // No other attempts available
  if (attempts.length < 2) {
    return <NoOtherAttemptsState roundType={roundType} sessionId={sessionId} />;
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
        <Button asChild variant="ghost" size="sm">
          <Link href={`/feedback/${sessionId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Feedback
          </Link>
        </Button>
      }
    >
      <motion.div
        variants={staggerContainer}
        initial={shouldReduceMotion ? false : "initial"}
        animate="animate"
        className="space-y-8"
      >
        {/* Page Header */}
        <motion.div variants={fadeInUp} className="space-y-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
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
              <fieldset className="min-w-0 space-y-3">
                <legend
                  id="earlier-attempt-legend"
                  className="text-foreground text-sm font-medium"
                >
                  Earlier Attempt
                </legend>
                <div
                  role="radiogroup"
                  aria-labelledby="earlier-attempt-legend"
                  className="space-y-2"
                >
                  {attempts
                    .filter((attempt) => attempt.id !== selectedAttempt2)
                    .map((attempt, index) => (
                      <SelectableCard
                        key={attempt.id}
                        role="radio"
                        aria-checked={selectedAttempt1 === attempt.id}
                        aria-pressed={undefined}
                        tabIndex={
                          selectedAttempt1
                            ? selectedAttempt1 === attempt.id
                              ? 0
                              : -1
                            : index === 0
                              ? 0
                              : -1
                        }
                        onKeyDown={moveRadioSelection}
                        onClick={() => setSelectedAttempt1(attempt.id)}
                        selected={selectedAttempt1 === attempt.id}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <span className="text-foreground text-sm font-medium">
                            {formatDate(attempt.startedAt)}
                          </span>
                          {attempt.overallScore !== null && (
                            <Badge className="border-border/50 bg-muted/50 text-muted-foreground">
                              {getDisplayedOverallScore(attempt.overallScore)}
                              /10
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
              </fieldset>

              {/* Attempt 2 Selection (Current) */}
              <section
                className="min-w-0 space-y-3"
                aria-labelledby="latest-attempt-heading"
              >
                <h3
                  id="latest-attempt-heading"
                  className="text-foreground text-sm font-medium"
                >
                  Latest Attempt
                </h3>
                <div className="space-y-2">
                  {attempts
                    .filter((attempt) => attempt.id === selectedAttempt2)
                    .map((attempt) => (
                      <div
                        key={attempt.id}
                        className="border-primary bg-primary/5 ring-primary/20 relative h-full w-full overflow-hidden rounded-lg border-2 p-4 text-left shadow-md ring-2"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <span className="text-foreground text-sm font-medium">
                            {formatDate(attempt.startedAt)}
                          </span>
                          {attempt.overallScore !== null && (
                            <Badge className="border-primary/20 bg-primary/10 text-primary">
                              {getDisplayedOverallScore(attempt.overallScore)}
                              /10
                            </Badge>
                          )}
                        </div>
                        <Badge className="border-primary/20 bg-primary/10 text-primary text-xs">
                          Latest Session
                        </Badge>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          </FeedbackSectionCard>
        </motion.div>

        {/* Comparison Display */}
        {comparing && (
          <motion.div
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 py-12"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm">
              Loading comparison...
            </p>
          </motion.div>
        )}

        {!comparing && !comparisonError && comparisonData && (
          <AttemptComparison comparison={comparisonData} />
        )}

        {!comparing && comparisonError && selectedAttempt1 && (
          <motion.div variants={fadeInUp}>
            <FeedbackStateCard
              role="alert"
              icon={<AlertCircle className="h-10 w-10" />}
              title="Comparison Unavailable"
              description={comparisonError}
              action={
                <Button onClick={() => setComparisonRetryKey((key) => key + 1)}>
                  Retry Comparison
                </Button>
              }
            />
          </motion.div>
        )}
      </motion.div>
    </FeedbackReviewShell>
  );
}

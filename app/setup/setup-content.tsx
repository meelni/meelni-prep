"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mic,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import {
  buildRecommendedRep,
  buildFullConfig,
  DIFFICULTY_LEVELS,
  INTERVIEW_TYPE_LABELS,
  mapQuestionTypeToRoundType,
  type DifficultyLevel,
  type MinimalInterviewConfig,
  type RoundType,
} from "@meelni/core";
import { validateSessionStart } from "@/lib/validation/setup-schema";
import { RoundSelector } from "./components/round-selector";
import { DifficultySelector } from "./components/difficulty-selector";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { QuotaExceededModal } from "@/components/dashboard/quota-exceeded-modal";
import { TierUpgradeModal } from "@/components/dashboard/tier-upgrade-modal";
import { StatusPill } from "@/components/ui/app-surface";
import { track, AnalyticsEvents } from "@/lib/analytics";
import { analytics } from "@/lib/analytics/analytics-service";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";

export function SetupContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fallbackRecommendation = buildRecommendedRep();
  const questionIdParam = searchParams.get("questionId");

  // Track Web Vitals performance
  useWebVitals("setup");

  // Recommendation-first launcher state.
  const [roundType, setRoundType] = useState<RoundType | null>(
    fallbackRecommendation.roundType
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(
    fallbackRecommendation.difficulty
  );
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageLoadTime = useRef(Date.now());
  const defaultRoundType = useRef<RoundType | null>(
    fallbackRecommendation.roundType
  );
  const defaultDifficulty = useRef<DifficultyLevel | null>(
    fallbackRecommendation.difficulty
  );

  // Question from explore page
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<{
    text: string;
    company: string | null;
    type: string;
  } | null>(null);
  const launcherViewKey = questionIdParam ?? "dashboard";
  const trackedLauncherViewKey = useRef<string | null>(null);

  const recommendation = buildRecommendedRep({
    selectedQuestion:
      questionId && questionData
        ? {
            id: questionId,
            text: questionData.text,
            company: questionData.company,
            type: questionData.type,
          }
        : null,
  });

  // Credit state is informational; session start remains the source of truth.
  const [creditBalance, setCreditBalance] = useState<{
    availableCredits: number;
    reservedCredits: number;
    nextCreditExpiresAt: string | null;
  } | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);

  // Quota exceeded modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{
    currentUsage: number;
    limit: number;
    resetDate: string | null;
  } | null>(null);

  // Tier upgrade modal state
  const [showTierUpgradeModal, setShowTierUpgradeModal] = useState(false);
  const [tierUpgradeInfo, setTierUpgradeInfo] = useState<{
    requestedType: RoundType;
    currentTier: string;
    message: string;
  } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/auth/signin?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, authLoading, pathname, router]);

  // Fetch question from URL parameter if provided
  useEffect(() => {
    if (!questionIdParam) {
      setQuestionId(null);
      setQuestionData(null);
      return;
    }

    let isCurrent = true;
    setQuestionId(null);
    setQuestionData(null);

    async function fetchQuestion() {
      try {
        const response = await fetch(`/api/questions/${questionIdParam}`);
        if (!response.ok) {
          console.error("Failed to fetch question");
          return;
        }

        const data = await response.json();
        if (!isCurrent) return;

        setQuestionId(questionIdParam);
        setQuestionData({
          text: data.questionText,
          company: data.company,
          type: data.questionType,
        });

        const mappedRoundType = mapQuestionTypeToRoundType(data.questionType);
        if (mappedRoundType) {
          setRoundType(mappedRoundType);
          defaultRoundType.current = mappedRoundType;
        }

        // Track that user came from explore page
        track(AnalyticsEvents.SETUP_PAGE_VIEWED, {
          source: "explore",
          questionId: questionIdParam,
          questionType: data.questionType,
        });
      } catch (error) {
        console.error("Error fetching question:", error);
      }
    }

    fetchQuestion();
    return () => {
      isCurrent = false;
    };
  }, [questionIdParam]);

  useEffect(() => {
    const isLauncherViewReady =
      !questionIdParam ||
      (questionId === questionIdParam && questionData !== null);

    if (
      !isLauncherViewReady ||
      trackedLauncherViewKey.current === launcherViewKey
    ) {
      return;
    }

    trackedLauncherViewKey.current = launcherViewKey;
    analytics.track("new_rep_launcher_viewed", {
      source: questionIdParam ? "selected_question" : "dashboard",
      recommended_round_type: recommendation.roundType,
      recommended_difficulty: recommendation.difficulty,
      recommendation_source: recommendation.source,
    });
  }, [
    launcherViewKey,
    recommendation.difficulty,
    recommendation.roundType,
    recommendation.source,
    questionData,
    questionId,
    questionIdParam,
  ]);

  // Fetch user credit balance on mount
  useEffect(() => {
    async function fetchCredits() {
      if (!user) return;

      try {
        const response = await fetch("/api/billing/credits");
        if (!response.ok) {
          console.error("Failed to fetch credits");
          setIsLoadingCredits(false);
          return;
        }

        const data = await response.json();
        setCreditBalance({
          availableCredits: data.availableCredits ?? 0,
          reservedCredits: data.reservedCredits ?? 0,
          nextCreditExpiresAt: data.nextCreditExpiresAt ?? null,
        });
        setIsLoadingCredits(false);

        // Track setup page view with credit context
        track(AnalyticsEvents.SETUP_PAGE_VIEWED, {
          availableCredits: data.availableCredits ?? 0,
          reservedCredits: data.reservedCredits ?? 0,
        });

        // Track setup started
        analytics.track("setup_started", {
          user_id: user.id,
          referrer_page:
            typeof document !== "undefined" ? document.referrer : undefined,
          user_authenticated: true,
        });
      } catch (error) {
        console.error("Error fetching credits:", error);
        setIsLoadingCredits(false);
      }
    }

    fetchCredits();
  }, [user]);

  const handleStartInterview = async () => {
    if (!roundType || !difficulty) {
      setError("Please complete all required fields");
      return;
    }

    setIsCreatingSession(true);
    setError(null);

    // Track setup completion
    const timeToComplete = (Date.now() - pageLoadTime.current) / 1000;
    const selectionsChanged =
      (roundType !== defaultRoundType.current ? 1 : 0) +
      (difficulty !== defaultDifficulty.current ? 1 : 0);

    analytics.track("setup_completed", {
      user_id: user!.id,
      interview_type: roundType,
      skill_level: difficulty,
      mode: "voice_video",
      time_to_complete_seconds: Math.floor(timeToComplete),
      selections_changed: selectionsChanged,
    });
    analytics.track("new_rep_start_attempted", {
      interview_type: roundType,
      skill_level: difficulty,
      recommendation_source: recommendation.source,
      accepted_recommendation:
        roundType === recommendation.roundType &&
        difficulty === recommendation.difficulty,
      question_id: questionId || undefined,
    });

    try {
      // Request microphone permission before starting interview
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[Setup] Microphone permission granted");
      } catch (permError) {
        console.error("[Setup] Microphone permission denied:", permError);
        setError(
          "Microphone access is required for voice interviews. Please grant permission and try again."
        );
        setIsCreatingSession(false);
        return;
      }

      // Build minimal user config
      const minimalConfig: MinimalInterviewConfig = {
        roundType,
        difficulty,
      };

      // Expand to full config with system defaults
      const fullConfig = buildFullConfig(minimalConfig);

      // Prepare session data
      const sessionData = {
        roundType,
        mode: "voice_video" as const,
        persona: undefined,
        config: fullConfig,
        questionId: questionId || undefined, // Include pre-selected question if available
      };

      // Validate data
      const validation = validateSessionStart(sessionData);
      if (!validation.success) {
        setError(validation.error);
        setIsCreatingSession(false);
        return;
      }

      // Call session start API
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle interview type locked error
        if (
          response.status === 403 &&
          errorData.error === "interview_type_locked"
        ) {
          setTierUpgradeInfo({
            requestedType: roundType,
            currentTier: errorData.currentTier || "free",
            message:
              errorData.message ||
              "This interview type requires an interview credit.",
          });
          setShowTierUpgradeModal(true);
          setIsCreatingSession(false);
          return;
        }

        // Handle no-credit errors from the credit ledger.
        if (
          (response.status === 402 &&
            errorData.error === "no_credits_remaining") ||
          (response.status === 403 && errorData.error === "quota_exceeded")
        ) {
          setQuotaInfo({
            currentUsage: creditBalance?.availableCredits ?? 0,
            limit: 1,
            resetDate: creditBalance?.nextCreditExpiresAt ?? null,
          });
          setShowQuotaModal(true);
          setIsCreatingSession(false);
          return;
        }

        throw new Error(errorData.error || "Failed to start session");
      }

      const { sessionId, token, url, roomName } = await response.json();

      analytics.track("new_rep_start_succeeded", {
        session_id: sessionId,
        interview_type: roundType,
        skill_level: difficulty,
        question_id: questionId || undefined,
      });

      // Navigate to interview page with session data
      router.push(
        "/interview?sessionId=" +
          sessionId +
          "&token=" +
          encodeURIComponent(token) +
          "&url=" +
          encodeURIComponent(url) +
          "&room=" +
          roomName
      );
    } catch (err) {
      console.error("Failed to start session:", err);
      analytics.track("new_rep_start_failed", {
        interview_type: roundType,
        skill_level: difficulty,
        error: err instanceof Error ? err.message : "unknown",
      });
      setError(
        err instanceof Error ? err.message : "Failed to start interview"
      );
      setIsCreatingSession(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-dashboard-muted flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading New Rep...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="bg-dashboard-panel text-dashboard-foreground min-h-full">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 sm:p-8">
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="space-y-6"
        >
          <motion.div
            variants={fadeInUp}
            className="border-dashboard-panel-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-2">
              <Link
                href="/dashboard"
                className="text-dashboard-muted hover:text-dashboard-foreground inline-flex items-center gap-2 text-sm transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
              <div>
                <h1 className="font-display text-dashboard-foreground text-3xl font-light tracking-tight">
                  New Rep
                </h1>
                <p className="text-dashboard-muted text-sm">
                  Pick the practice rep you want to start, then enter the room.
                </p>
              </div>
            </div>
            {creditBalance && (
              <StatusPill tone="muted" className="w-fit">
                <CreditCard className="h-3.5 w-3.5" />
                {creditBalance.availableCredits}{" "}
                {creditBalance.availableCredits === 1 ? "credit" : "credits"}
              </StatusPill>
            )}
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="border-destructive/25 bg-destructive/10 text-destructive flex items-start gap-3 rounded-lg border p-4 text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.section
            variants={fadeInUp}
            className="border-primary/25 bg-primary/10 rounded-lg border p-5 shadow-[0_2px_12px_rgb(0_0_0_/_0.2)]"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Recommended
                  </StatusPill>
                  <StatusPill tone="muted">
                    {recommendation.durationMinutes} min
                  </StatusPill>
                  <StatusPill tone="muted">
                    {recommendation.creditCost} credit
                  </StatusPill>
                </div>
                <div className="space-y-2">
                  <h2 className="text-dashboard-foreground text-xl font-semibold">
                    {INTERVIEW_TYPE_LABELS[recommendation.roundType]} rep for{" "}
                    {DIFFICULTY_LEVELS[recommendation.difficulty].label}
                  </h2>
                  <p className="text-dashboard-muted max-w-2xl text-sm leading-6">
                    {recommendation.rationale}
                  </p>
                </div>
                {questionData && (
                  <div className="border-dashboard-panel-border bg-dashboard-canvas/40 rounded-lg border p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusPill tone="primary">Selected question</StatusPill>
                      {questionData.company && (
                        <StatusPill tone="muted">
                          {questionData.company}
                        </StatusPill>
                      )}
                      <StatusPill tone="muted">{questionData.type}</StatusPill>
                    </div>
                    <p className="text-dashboard-foreground text-sm leading-6">
                      {questionData.text}
                    </p>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRoundType(recommendation.roundType);
                  setDifficulty(recommendation.difficulty);
                  analytics.track("new_rep_recommendation_accepted", {
                    recommended_round_type: recommendation.roundType,
                    recommended_difficulty: recommendation.difficulty,
                    recommendation_source: recommendation.source,
                  });
                }}
                className="w-full shrink-0 sm:w-fit"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Use recommendation
              </Button>
            </div>
          </motion.section>

          <motion.section variants={fadeInUp} className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-dashboard-foreground text-base font-semibold">
                Customize
              </h2>
              <p className="text-dashboard-muted text-sm">
                Change the round or seniority bar before starting.
              </p>
            </div>

            {isLoadingCredits ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="bg-muted h-32 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : (
              <RoundSelector
                selected={roundType}
                onSelect={(type) => {
                  if (defaultRoundType.current === null) {
                    defaultRoundType.current = type;
                  }
                  analytics.track("new_rep_recommendation_changed", {
                    field: "round_type",
                    value: type,
                    recommended_round_type: recommendation.roundType,
                  });
                  setRoundType(type);
                }}
                lockedTypes={[]}
              />
            )}

            <DifficultySelector
              selected={difficulty}
              onSelect={(level) => {
                if (defaultDifficulty.current === null) {
                  defaultDifficulty.current = level;
                }

                analytics.track("skill_level_selected", {
                  skill_level: level,
                  interview_type: roundType || "unknown",
                  is_default_selection: defaultDifficulty.current === level,
                });
                analytics.track("new_rep_recommendation_changed", {
                  field: "difficulty",
                  value: level,
                  recommended_difficulty: recommendation.difficulty,
                });

                setDifficulty(level);
              }}
            />
          </motion.section>

          <motion.div
            variants={fadeInUp}
            className="border-dashboard-panel-border bg-dashboard-panel/95 sticky bottom-0 -mx-5 border-t p-5 backdrop-blur sm:-mx-8 sm:px-8"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-dashboard-muted flex items-center gap-3 text-sm">
                <Mic className="text-primary h-4 w-4" />
                <span>
                  {roundType && INTERVIEW_TYPE_LABELS[roundType]} ·{" "}
                  {difficulty && DIFFICULTY_LEVELS[difficulty].label} · hints
                  off by default
                </span>
              </div>
              <Button
                onClick={handleStartInterview}
                disabled={isCreatingSession || !roundType || !difficulty}
                className="text-primary-foreground w-full sm:w-auto"
              >
                {isCreatingSession ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting rep...
                  </>
                ) : (
                  <>
                    Start rep
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* Tier Upgrade Modal */}
      {tierUpgradeInfo && (
        <TierUpgradeModal
          isOpen={showTierUpgradeModal}
          onClose={() => setShowTierUpgradeModal(false)}
          requestedType={tierUpgradeInfo.requestedType}
          currentTier={tierUpgradeInfo.currentTier}
          message={tierUpgradeInfo.message}
        />
      )}

      {/* Quota Exceeded Modal */}
      {quotaInfo && (
        <QuotaExceededModal
          isOpen={showQuotaModal}
          onClose={() => setShowQuotaModal(false)}
          currentUsage={quotaInfo.currentUsage}
          limit={quotaInfo.limit}
          resetDate={quotaInfo.resetDate}
        />
      )}
    </div>
  );
}

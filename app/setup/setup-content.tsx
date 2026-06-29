"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import {
  buildFullConfig,
  INTERVIEW_TYPE_LABELS,
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
import { track, AnalyticsEvents } from "@/lib/analytics";
import { analytics } from "@/lib/analytics/analytics-service";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";

export function SetupContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Track Web Vitals performance
  useWebVitals('setup');

  // Simplified 2-step state
  const [step, setStep] = useState<1 | 2>(1);
  const [roundType, setRoundType] = useState<RoundType | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageLoadTime = useRef(Date.now());
  const defaultRoundType = useRef<RoundType | null>(null);
  const defaultDifficulty = useRef<DifficultyLevel | null>(null);

  // Question from explore page
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<{
    text: string;
    company: string | null;
    type: string;
  } | null>(null);

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
      router.push("/auth/signin?redirectTo=/setup");
    }
  }, [user, authLoading, router]);

  // Fetch question from URL parameter if provided
  useEffect(() => {
    const questionIdParam = searchParams.get("questionId");
    if (!questionIdParam) return;

    async function fetchQuestion() {
      try {
        const response = await fetch(`/api/questions/${questionIdParam}`);
        if (!response.ok) {
          console.error("Failed to fetch question");
          return;
        }

        const data = await response.json();
        setQuestionId(questionIdParam);
        setQuestionData({
          text: data.questionText,
          company: data.company,
          type: data.questionType,
        });

        // Map question type to roundType
        const typeMapping: Record<string, RoundType> = {
          "Behavioral": "behavioral",
          "Product Sense": "product_sense",
          "Product design/strategy": "product_sense",
          "Execution": "execution",
          "Estimation": "execution",
          "A/B Testing": "execution",
          "Pricing": "execution",
          "Product Strategy": "strategy",
        };

        const mappedRoundType = typeMapping[data.questionType];
        if (mappedRoundType) {
          setRoundType(mappedRoundType);
          defaultRoundType.current = mappedRoundType;
          // Skip to difficulty selection (step 2)
          setStep(2);
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
  }, [searchParams]);

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
          referrer_page: typeof document !== "undefined" ? document.referrer : undefined,
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

    try {
      // Request microphone permission before starting interview
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[Setup] Microphone permission granted");
      } catch (permError) {
        console.error("[Setup] Microphone permission denied:", permError);
        setError("Microphone access is required for voice interviews. Please grant permission and try again.");
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
        if (response.status === 403 && errorData.error === "interview_type_locked") {
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

      // Navigate to interview page with session data
      router.push(
        "/interview?sessionId=" + sessionId +
        "&token=" + encodeURIComponent(token) +
        "&url=" + encodeURIComponent(url) +
        "&room=" + roomName
      );
    } catch (err) {
      console.error("Failed to start session:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start interview"
      );
      setIsCreatingSession(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50"
      >
        <div className="container max-w-4xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-full">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="space-y-6"
        >
          {/* Title */}
          <motion.div variants={fadeInUp} className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Setup Your Interview</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Two quick choices and you&apos;re ready to practice
            </p>
          </motion.div>

          {/* Simplified Progress Indicator - Just 2 steps */}
          <motion.div variants={fadeInUp} className="flex items-center gap-3 max-w-md">
            {[
              { num: 1, label: "Interview Type" },
              { num: 2, label: "Difficulty Level" },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all " +
                      (step >= s.num
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {s.num}
                  </div>
                  <span
                    className={
                      "text-sm font-medium hidden sm:inline " +
                      (step >= s.num
                        ? "text-foreground"
                        : "text-muted-foreground")
                    }
                  >
                    {s.label}
                  </span>
                </div>
                {i < 1 && (
                  <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={
                        "h-full bg-primary transition-all duration-300 " +
                        (step > s.num ? "w-full" : "w-0")
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </motion.div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {/* Step 1: Interview Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">
                    Choose Interview Type
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Select the type of interview you want to practice
                  </p>
                </div>
                {isLoadingCredits ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-32 rounded-lg bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {creditBalance && (
                      <p className="text-sm text-muted-foreground">
                        {creditBalance.availableCredits} interview{" "}
                        {creditBalance.availableCredits === 1
                          ? "credit"
                          : "credits"}{" "}
                        available. Each full interview uses 1 credit.
                      </p>
                    )}
                    <RoundSelector
                      selected={roundType}
                      onSelect={(type) => {
                        // Save first selection as default for comparison later
                        if (defaultRoundType.current === null) {
                          defaultRoundType.current = type;
                        }
                        setRoundType(type);
                      }}
                      lockedTypes={[]}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Difficulty Level */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Show selected question if coming from explore page */}
                {questionData && (
                  <div className="p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                        Selected Question
                      </span>
                      {questionData.company && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {questionData.company}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-base font-semibold text-foreground leading-relaxed">
                      {questionData.text}
                    </p>
                  </div>
                )}

                <DifficultySelector
                  selected={difficulty}
                  onSelect={(level) => {
                    // Save first selection as default for comparison later
                    if (defaultDifficulty.current === null) {
                      defaultDifficulty.current = level;
                    }

                    // Track skill level selection
                    analytics.track("skill_level_selected", {
                      skill_level: level,
                      interview_type: roundType || "unknown",
                      is_default_selection: defaultDifficulty.current === level,
                    });

                    setDifficulty(level);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          <motion.div
            variants={fadeInUp}
            className="flex items-center gap-3 pt-4"
          >
            {step === 2 && (
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}

            {step === 1 && roundType && (
              <Button
                onClick={() => setStep(2)}
                className="flex-1"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}

            {step === 2 && difficulty && (
              <Button
                onClick={handleStartInterview}
                disabled={isCreatingSession}
                className="flex-1"
              >
                {isCreatingSession ? "Starting..." : "Start Interview"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
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

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CreditCard,
  Loader2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { useAuth } from "@/app/providers/auth-provider";
import {
  BILLING_CATALOG,
  buildInterviewRecommendation,
  buildFullConfig,
  DIFFICULTY_LEVELS,
  getDefaultDuration,
  INTERVIEW_TYPE_LABELS,
  type DifficultyLevel,
  type MinimalInterviewConfig,
  type RoundType,
} from "@meelni/core";
import { validateSessionStart } from "@/lib/validation/setup-schema";
import { RoundSelector } from "./components/round-selector";
import { DifficultySelector } from "./components/difficulty-selector";
import { SelectedQuestionConfirmation } from "./components/selected-question-confirmation";
import { InterviewDataDisclosure } from "./components/interview-data-disclosure";
import { useSelectedQuestionIntent } from "./use-selected-question-intent";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { QuotaExceededModal } from "@/components/dashboard/quota-exceeded-modal";
import { TierUpgradeModal } from "@/components/dashboard/tier-upgrade-modal";
import { StatusPill } from "@/components/ui/app-surface";
import { track, AnalyticsEvents } from "@/lib/analytics";
import { analytics } from "@/lib/analytics/analytics-service";
import { trackInterviewLaunchEvent } from "@/lib/analytics/interview-launch-compat";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import {
  buildInterviewHrefWithoutQuestion,
  parseInterviewLaunchContext,
} from "@/lib/navigation/interview-launch";
import { getCanonicalInterviewHref } from "@/components/interview/session-recovery";
import {
  clearInterviewStartAttempt,
  getOrCreateInterviewStartAttempt,
  isDefinitiveInterviewStartFailure,
} from "@/lib/interview/start-attempt";
import {
  createInterviewStartSingleFlight,
  recoverInterviewStart,
} from "@/lib/interview/start-recovery";
import { storeInitialInterviewRoomCredentials } from "@/lib/interview/room-credential-handoff";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { fetchWithDeadline } from "@/lib/http/deadline";
import {
  buildInterviewStartStageEvent,
  INTERVIEW_START_SLOS,
  type InterviewStartStageOutcome,
} from "@/lib/operations/interview-start-slo";
import {
  normalizeInterviewLauncherDefaults,
  resolveInterviewLauncherDefaults,
} from "@/lib/dashboard/interview-defaults";

const INITIAL_LAUNCHER_DEFAULTS = normalizeInterviewLauncherDefaults(null);

export function SetupContent({
  voiceUnavailableInPreview,
}: {
  voiceUnavailableInPreview: boolean;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const launchContext = useMemo(
    () => parseInterviewLaunchContext(searchParams),
    [searchParams]
  );
  const fallbackRecommendation = useMemo(
    () =>
      buildInterviewRecommendation({
        requestedRoundType: launchContext.roundType,
        requestedDifficulty: launchContext.difficulty,
        focus: launchContext.focus,
        company: launchContext.company,
      }),
    [
      launchContext.company,
      launchContext.difficulty,
      launchContext.focus,
      launchContext.roundType,
    ]
  );
  const questionIdParam = launchContext.questionId;

  // Track Web Vitals performance
  useWebVitals("setup");

  // Recommendation-first launcher state.
  const [roundType, setRoundType] = useState<RoundType | null>(
    fallbackRecommendation.roundType
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(
    fallbackRecommendation.difficulty
  );
  const [savedLauncherDefaults, setSavedLauncherDefaults] = useState(
    INITIAL_LAUNCHER_DEFAULTS
  );
  const [launcherDefaultsResolved, setLauncherDefaultsResolved] =
    useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isRecoveringStart, setIsRecoveringStart] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageLoadTime = useRef(Date.now());
  const defaultRoundType = useRef<RoundType | null>(
    fallbackRecommendation.roundType
  );
  const defaultDifficulty = useRef<DifficultyLevel | null>(
    fallbackRecommendation.difficulty
  );
  const roundCustomized = useRef(false);
  const difficultyCustomized = useRef(false);
  const startSingleFlight = useMemo(createInterviewStartSingleFlight, []);

  useEffect(
    () => () => startSingleFlight.cancel("component_unmounted"),
    [startSingleFlight]
  );

  const { state: questionIntentState, retry: retryQuestionVerification } =
    useSelectedQuestionIntent(questionIdParam);
  const questionId =
    questionIntentState.status === "ready" ? questionIdParam : null;
  const questionData =
    questionIntentState.status === "ready"
      ? questionIntentState.question
      : null;
  const selectedQuestionRoundType =
    questionIntentState.status === "ready"
      ? questionIntentState.roundType
      : null;
  const effectiveRoundType = selectedQuestionRoundType ?? roundType;
  const launcherViewKey = questionIdParam ?? "dashboard";
  const trackedLauncherViewKey = useRef<string | null>(null);

  const resolvedLauncherDefaults = resolveInterviewLauncherDefaults({
    saved: savedLauncherDefaults,
    explicitRoundType: launchContext.roundType,
    explicitDifficulty: launchContext.difficulty,
  });
  const recommendation = buildInterviewRecommendation({
    selectedQuestion:
      questionId && questionData
        ? {
            id: questionId,
            text: questionData.text,
            company: questionData.company ?? launchContext.company,
            type: questionData.type,
          }
        : null,
    requestedRoundType: resolvedLauncherDefaults.roundType,
    requestedDifficulty: resolvedLauncherDefaults.difficulty,
    focus: launchContext.focus,
    company: launchContext.company,
  });
  const hasLaunchContext = Boolean(
    launchContext.roundType ||
      launchContext.difficulty ||
      launchContext.focus ||
      launchContext.company ||
      launchContext.returnTo
  );
  const analyticsLaunchContext = useMemo(
    () => ({
      focus: launchContext.focus ?? undefined,
      company: launchContext.company ?? undefined,
      return_to: launchContext.returnTo ?? undefined,
    }),
    [launchContext.company, launchContext.focus, launchContext.returnTo]
  );
  const continueWithoutQuestionHref = useMemo(
    () => buildInterviewHrefWithoutQuestion(searchParams.toString()),
    [searchParams]
  );
  const changeQuestionHref = launchContext.returnTo ?? "/explore";

  // Credit state is informational; session start remains the source of truth.
  const [creditBalance, setCreditBalance] = useState<{
    availableCredits: number;
    reservedCredits: number;
    nextCreditExpiresAt: string | null;
    trialAvailable: boolean;
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
  const startInterviewButtonRef = useRef<HTMLButtonElement>(null);
  const [tierUpgradeInfo, setTierUpgradeInfo] = useState<{
    requestedType: RoundType;
    currentTier: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (launchContext.roundType) {
      setRoundType(launchContext.roundType);
      defaultRoundType.current = launchContext.roundType;
    }
    if (launchContext.difficulty) {
      setDifficulty(launchContext.difficulty);
      defaultDifficulty.current = launchContext.difficulty;
    }
  }, [launchContext.difficulty, launchContext.roundType]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function loadLauncherDefaults() {
      try {
        const response = await fetchWithDeadline(
          "/api/user/settings",
          {},
          INTERVIEW_START_SLOS.customer_read.upperBoundMs
        );
        if (!response.ok) return;
        const payload: unknown = await response.json();
        const settings =
          payload && typeof payload === "object" && "settings" in payload
            ? (payload as { settings?: unknown }).settings
            : null;
        const normalized = normalizeInterviewLauncherDefaults(settings);
        if (!active) return;

        setSavedLauncherDefaults(normalized);
        if (
          !launchContext.roundType &&
          !questionIdParam &&
          !roundCustomized.current
        ) {
          setRoundType(normalized.roundType);
          defaultRoundType.current = normalized.roundType;
        }
        if (!launchContext.difficulty && !difficultyCustomized.current) {
          setDifficulty(normalized.difficulty);
          defaultDifficulty.current = normalized.difficulty;
        }
      } catch (loadError) {
        console.error("[Interview Setup] settings_fetch_failed", {
          code: "settings_fetch_failed",
          ...toSafeErrorLog(loadError),
        });
      } finally {
        if (active) setLauncherDefaultsResolved(true);
      }
    }

    void loadLauncherDefaults();
    return () => {
      active = false;
    };
  }, [
    launchContext.difficulty,
    launchContext.roundType,
    questionIdParam,
    user?.id,
  ]);

  useEffect(() => {
    if (questionIntentState.status !== "ready" || !questionIdParam) {
      return;
    }

    setRoundType(questionIntentState.roundType);
    defaultRoundType.current = questionIntentState.roundType;
    track(AnalyticsEvents.SETUP_PAGE_VIEWED, {
      source: "explore",
      questionId: questionIdParam,
      questionType: questionIntentState.question.type,
    });
  }, [questionIdParam, questionIntentState]);

  useEffect(() => {
    const isLauncherViewReady =
      !questionIdParam ||
      (questionId === questionIdParam && questionData !== null);

    if (
      !isLauncherViewReady ||
      !launcherDefaultsResolved ||
      trackedLauncherViewKey.current === launcherViewKey
    ) {
      return;
    }

    trackedLauncherViewKey.current = launcherViewKey;
    const properties = {
      source: questionIdParam
        ? ("selected_question" as const)
        : hasLaunchContext
          ? ("launch_context" as const)
          : ("dashboard" as const),
      recommended_round_type: recommendation.roundType,
      recommended_difficulty: recommendation.difficulty,
      recommendation_source: recommendation.source,
      ...analyticsLaunchContext,
    };

    trackInterviewLaunchEvent("new_interview_launcher_viewed", properties);
  }, [
    analyticsLaunchContext,
    hasLaunchContext,
    launcherViewKey,
    launcherDefaultsResolved,
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
          trialAvailable: data.trialAvailable === true,
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
        console.error("[Interview Setup] credit_fetch_failed", {
          code: "credit_fetch_failed",
          ...toSafeErrorLog(error),
        });
        setIsLoadingCredits(false);
      }
    }

    fetchCredits();
  }, [user]);

  const handleStartInterview = () => {
    if (voiceUnavailableInPreview) {
      setError(
        "Voice practice is unavailable in this web Preview. Use the trusted staging environment for voice rehearsal."
      );
      return;
    }

    return startSingleFlight.run(async (signal) => {
      if (questionIdParam && questionIntentState.status !== "ready") {
        setError("Choose an available question before starting.");
        return;
      }

      if (!effectiveRoundType || !difficulty) {
        setError("Please complete all required fields");
        return;
      }

      setIsCreatingSession(true);
      setIsRecoveringStart(false);
      setShowCustomization(false);
      setError(null);

      // Track setup completion
      const timeToComplete = (Date.now() - pageLoadTime.current) / 1000;
      const selectionsChanged =
        (effectiveRoundType !== defaultRoundType.current ? 1 : 0) +
        (difficulty !== defaultDifficulty.current ? 1 : 0);

      analytics.track("setup_completed", {
        user_id: user!.id,
        interview_type: effectiveRoundType,
        skill_level: difficulty,
        mode: "voice_video",
        time_to_complete_seconds: Math.floor(timeToComplete),
        selections_changed: selectionsChanged,
      });
      const startAttemptedProperties = {
        interview_type: effectiveRoundType,
        skill_level: difficulty,
        recommendation_source: recommendation.source,
        accepted_recommendation:
          effectiveRoundType === recommendation.roundType &&
          difficulty === recommendation.difficulty,
        question_id: questionId || undefined,
        ...analyticsLaunchContext,
      };
      trackInterviewLaunchEvent(
        "new_interview_start_attempted",
        startAttemptedProperties
      );

      try {
        // Request microphone permission before starting interview
        try {
          await checkMicrophonePermission();
          if (signal.aborted) return;
          console.log("[Setup] Microphone permission granted");
        } catch (permError) {
          if (signal.aborted) return;
          console.error("[Interview Setup] microphone_permission_denied", {
            code: "microphone_permission_denied",
            ...toSafeErrorLog(permError),
          });
          setError(
            "Microphone access is required for voice interviews. Please grant permission and try again."
          );
          setIsCreatingSession(false);
          return;
        }

        // Build minimal user config
        const minimalConfig: MinimalInterviewConfig = {
          roundType: effectiveRoundType,
          difficulty,
        };

        // Expand to full config with system defaults
        const fullConfig = {
          ...buildFullConfig(minimalConfig),
          questionPreference: savedLauncherDefaults.questionPreference,
        };

        // Prepare session data
        const sessionData = {
          roundType: effectiveRoundType,
          mode: "voice_video" as const,
          config: fullConfig,
          questionId: questionId || undefined, // Include pre-selected question if available
          company: launchContext.company || undefined,
        };

        // Validate data
        const validation = validateSessionStart(sessionData);
        if (!validation.success) {
          setError(validation.error);
          setIsCreatingSession(false);
          return;
        }

        const startAttemptId = getOrCreateInterviewStartAttempt(
          validation.data
        );
        const startBody = { ...validation.data, startAttemptId };

        // Bounded idempotent POST replay is the recovery transport. Every request
        // carries the exact same durable attempt UUID and validated intent.
        let requestCount = 0;
        let recoveryStartedAt: number | null = null;
        const recovery = await recoverInterviewStart({
          signal,
          request: async (requestSignal) => {
            requestCount += 1;
            const requestStartedAt = Date.now();
            try {
              const response = await fetchWithDeadline(
                "/api/session/start",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(startBody),
                  signal: requestSignal,
                },
                INTERVIEW_START_SLOS.launch_request.upperBoundMs
              );
              if (requestCount === 1) {
                trackStartStage(
                  "launch_request",
                  response.ok ? "succeeded" : "failed",
                  Date.now() - requestStartedAt
                );
              }
              return response;
            } catch (launchError) {
              if (requestCount === 1) {
                trackStartStage(
                  "launch_request",
                  launchError instanceof Error &&
                    launchError.name === "AbortError"
                    ? "delayed"
                    : "failed",
                  Date.now() - requestStartedAt
                );
              }
              throw launchError;
            }
          },
          onRecoveryStarted: () => {
            recoveryStartedAt = Date.now();
            if (!signal.aborted) setIsRecoveringStart(true);
          },
        });

        if (recoveryStartedAt !== null) {
          trackStartStage(
            "launch_recovery",
            recovery.disposition === "ready"
              ? "succeeded"
              : recovery.disposition === "timed_out"
                ? "delayed"
                : recovery.disposition === "aborted"
                  ? "aborted"
                  : "terminal",
            Date.now() - recoveryStartedAt
          );
        }

        if (recovery.disposition === "aborted") {
          if (signal.reason === "candidate_cancelled") {
            setError(
              "Interview start canceled. Start again to safely resume the same attempt."
            );
            setIsCreatingSession(false);
            setIsRecoveringStart(false);
          }
          return;
        }
        if (recovery.disposition === "timed_out") {
          throw new Error(
            "We couldn't confirm the interview start within one minute. Try again to safely resume the same start attempt."
          );
        }

        const response = recovery.response;
        const responseData = recovery.body;
        if (recovery.disposition === "terminal") {
          if (
            isDefinitiveInterviewStartFailure(response.status, responseData)
          ) {
            clearInterviewStartAttempt(startAttemptId);
          }
          const errorData = isRecord(responseData) ? responseData : {};
          const errorCode =
            typeof errorData.error === "string" ? errorData.error : null;
          const errorMessage =
            typeof errorData.message === "string" ? errorData.message : null;

          // Handle interview type locked error
          if (
            response.status === 403 &&
            errorCode === "interview_type_locked"
          ) {
            setTierUpgradeInfo({
              requestedType: effectiveRoundType,
              currentTier:
                typeof errorData.currentTier === "string"
                  ? errorData.currentTier
                  : "free",
              message:
                errorMessage ||
                "This interview type requires an interview credit.",
            });
            setShowTierUpgradeModal(true);
            setIsCreatingSession(false);
            setIsRecoveringStart(false);
            return;
          }

          // Handle no-credit errors from the credit ledger.
          if (
            (response.status === 402 && errorCode === "no_credits_remaining") ||
            (response.status === 403 && errorCode === "quota_exceeded")
          ) {
            setQuotaInfo({
              currentUsage: creditBalance?.availableCredits ?? 0,
              limit: 1,
              resetDate: creditBalance?.nextCreditExpiresAt ?? null,
            });
            setShowQuotaModal(true);
            setIsCreatingSession(false);
            setIsRecoveringStart(false);
            return;
          }

          throw new Error(
            errorMessage || errorCode || "Failed to start session"
          );
        }

        const sessionId = recovery.sessionId;
        if (signal.aborted) return;
        storeInitialInterviewRoomCredentials({
          response: responseData,
          sessionId,
          ownerId: user!.id,
        });
        clearInterviewStartAttempt(startAttemptId);

        const startSucceededProperties = {
          session_id: sessionId,
          interview_type: effectiveRoundType,
          skill_level: difficulty,
          question_id: questionId || undefined,
          ...analyticsLaunchContext,
        };
        trackInterviewLaunchEvent(
          "new_interview_start_succeeded",
          startSucceededProperties
        );

        // Keep room credentials out of browser history. A one-time, owner-bound
        // handoff lets the interview route use the token that this successful
        // start already authorized; reloads still use the reconnect endpoint.
        router.push(getCanonicalInterviewHref(sessionId));
      } catch (err) {
        if (signal.aborted) {
          if (signal.reason === "candidate_cancelled") {
            setError(
              "Interview start canceled. Start again to safely resume the same attempt."
            );
            setIsCreatingSession(false);
            setIsRecoveringStart(false);
          }
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          setIsCreatingSession(false);
          setIsRecoveringStart(false);
          return;
        }
        console.error("[Interview Setup] start_failed", {
          code: "interview_start_failed",
          ...toSafeErrorLog(err),
        });
        const startFailedProperties = {
          interview_type: effectiveRoundType,
          skill_level: difficulty,
          error: "interview_start_failed",
          ...analyticsLaunchContext,
        };
        trackInterviewLaunchEvent(
          "new_interview_start_failed",
          startFailedProperties
        );
        setError(
          err instanceof Error ? err.message : "Failed to start interview"
        );
        setIsCreatingSession(false);
        setIsRecoveringStart(false);
      }
    });
  };

  const cancelInterviewStart = () => {
    startSingleFlight.cancel("candidate_cancelled");
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-dashboard-muted flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading New Mock Interview...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const matchesRecommendation =
    effectiveRoundType === recommendation.roundType &&
    difficulty === recommendation.difficulty;
  const selectedRoundLabel = effectiveRoundType
    ? INTERVIEW_TYPE_LABELS[effectiveRoundType]
    : "PM";
  const selectedExperienceLabel = difficulty
    ? DIFFICULTY_LEVELS[difficulty].label
    : "Experience not selected";
  const selectedDurationMinutes = getDefaultDuration(
    effectiveRoundType ?? recommendation.roundType
  );
  const startDisabled =
    isCreatingSession ||
    !launcherDefaultsResolved ||
    voiceUnavailableInPreview ||
    !effectiveRoundType ||
    !difficulty ||
    (questionIdParam !== null && questionIntentState.status !== "ready");

  return (
    <DashboardPage
      label="New Mock Interview"
      bodyClassName="overflow-y-auto px-0 py-0"
    >
      <div
        data-testid="new-interview-scroll-container"
        className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 sm:p-8"
      >
        <motion.div
          initial={shouldReduceMotion ? false : "initial"}
          animate="animate"
          variants={staggerContainer}
          className="space-y-5"
        >
          <motion.div
            variants={fadeInUp}
            className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <h2 className="font-display text-dashboard-foreground text-3xl font-light tracking-tight">
                Ready when you are
              </h2>
              <p className="text-dashboard-muted mt-2 max-w-2xl text-sm leading-6">
                Start with the recommended setup, or change it before entering
                the interview room.
              </p>
            </div>
            {creditBalance && (
              <StatusPill
                tone="muted"
                className="border-dashboard-panel-border bg-dashboard-muted/10 text-dashboard-foreground w-fit shrink-0"
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                {creditBalance.availableCredits}{" "}
                {creditBalance.availableCredits === 1 ? "credit" : "credits"}{" "}
                available
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

          {voiceUnavailableInPreview && (
            <motion.div
              variants={fadeInUp}
              role="status"
              className="border-warning/25 bg-warning/10 text-dashboard-foreground flex items-start gap-3 rounded-lg border p-4 text-sm"
            >
              <AlertCircle
                className="text-warning mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-semibold">
                  Voice is off in this web Preview
                </p>
                <p className="text-dashboard-muted">
                  Non-voice surfaces remain available. Use the trusted staging
                  environment for LiveKit rehearsal.
                </p>
              </div>
            </motion.div>
          )}

          {questionIntentState.status !== "none" && (
            <motion.div variants={fadeInUp}>
              <SelectedQuestionConfirmation
                state={questionIntentState}
                changeQuestionHref={changeQuestionHref}
                continueWithoutQuestionHref={continueWithoutQuestionHref}
                onRetry={retryQuestionVerification}
              />
            </motion.div>
          )}

          <motion.section
            variants={fadeInUp}
            className="border-dashboard-accent/30 bg-dashboard-accent/10 rounded-lg border p-5 sm:p-6"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {matchesRecommendation && (
                  <span className="text-dashboard-accent inline-flex items-center gap-1.5 font-semibold">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Recommended setup
                  </span>
                )}
                {!matchesRecommendation && (
                  <span className="text-dashboard-foreground font-semibold">
                    Your setup
                  </span>
                )}
                <span className="text-dashboard-foreground/75">
                  {selectedDurationMinutes} min · 1 credit
                </span>
              </div>
              <h2 className="text-dashboard-foreground mt-3 text-2xl font-semibold">
                {selectedRoundLabel} · {selectedExperienceLabel}
              </h2>
              <p className="text-dashboard-foreground/75 mt-2 max-w-2xl text-sm leading-6">
                {matchesRecommendation
                  ? recommendation.rationale
                  : "Your selected interview round and experience level will be used when the room starts."}
              </p>
              {(launchContext.focus || launchContext.company) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {launchContext.company && (
                    <StatusPill tone="muted">
                      Company: {launchContext.company}
                    </StatusPill>
                  )}
                  {launchContext.focus && (
                    <StatusPill tone="muted">
                      Focus: {launchContext.focus}
                    </StatusPill>
                  )}
                </div>
              )}
              <div className="mt-5">
                <InterviewDataDisclosure />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                ref={startInterviewButtonRef}
                onClick={handleStartInterview}
                disabled={startDisabled}
                className="text-primary-foreground min-h-11 w-full gap-2 sm:w-auto"
              >
                {voiceUnavailableInPreview ? (
                  "Voice unavailable in Preview"
                ) : !launcherDefaultsResolved ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Loading saved setup...
                  </>
                ) : isCreatingSession ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    {isRecoveringStart
                      ? "Still starting interview..."
                      : "Starting mock interview..."}
                  </>
                ) : (
                  <>
                    Start mock interview
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
              {isCreatingSession && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelInterviewStart}
                  className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground min-h-11 w-full bg-transparent sm:w-auto"
                >
                  Cancel start
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={isCreatingSession}
                aria-expanded={showCustomization}
                aria-controls="interview-customization"
                onClick={() => setShowCustomization((current) => !current)}
                className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground min-h-11 w-full gap-2 bg-transparent sm:w-auto"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {showCustomization ? "Hide setup options" : "Change setup"}
              </Button>
            </div>
            {isRecoveringStart && (
              <p
                className="text-dashboard-muted mt-4 max-w-2xl text-sm leading-6"
                role="status"
                aria-live="polite"
              >
                This is taking longer than usual. We’re safely checking the same
                start attempt; no second click or extra credit is needed.
              </p>
            )}
            {creditBalance?.trialAvailable && (
              <p className="text-dashboard-muted mt-4 text-xs leading-5">
                Your {BILLING_CATALOG.trial.includedCredits}-credit trial starts
                with this first mock interview.
              </p>
            )}
            {isLoadingCredits && (
              <p className="text-dashboard-muted mt-4 text-xs" role="status">
                Checking interview credits…
              </p>
            )}
          </motion.section>

          <AnimatePresence initial={false}>
            {showCustomization && (
              <motion.section
                id="interview-customization"
                initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={
                  shouldReduceMotion ? undefined : { opacity: 0, height: 0 }
                }
                transition={{ duration: 0.2 }}
                className="border-dashboard-panel-border space-y-6 overflow-hidden border-t pt-6"
              >
                <div>
                  <h2 className="text-dashboard-foreground text-lg font-semibold">
                    Setup options
                  </h2>
                  <p className="text-dashboard-muted mt-1 text-sm leading-6">
                    {selectedQuestionRoundType
                      ? "The selected question fixes the interview round. You can still change the experience level."
                      : "Choose a PM interview round and the experience level the interviewer should calibrate for."}
                  </p>
                </div>
                <RoundSelector
                  selected={effectiveRoundType}
                  disabled={
                    isCreatingSession || Boolean(selectedQuestionRoundType)
                  }
                  onSelect={(type) => {
                    roundCustomized.current = true;
                    if (defaultRoundType.current === null) {
                      defaultRoundType.current = type;
                    }
                    const properties = {
                      field: "round_type",
                      value: type,
                      recommended_round_type: recommendation.roundType,
                      ...analyticsLaunchContext,
                    } as const;
                    trackInterviewLaunchEvent(
                      "new_interview_recommendation_changed",
                      properties
                    );
                    if (!selectedQuestionRoundType) setRoundType(type);
                  }}
                  lockedTypes={[]}
                />

                <DifficultySelector
                  selected={difficulty}
                  onSelect={(level) => {
                    if (isCreatingSession) return;
                    difficultyCustomized.current = true;
                    if (defaultDifficulty.current === null) {
                      defaultDifficulty.current = level;
                    }

                    analytics.track("skill_level_selected", {
                      skill_level: level,
                      interview_type: effectiveRoundType || "unknown",
                      is_default_selection: defaultDifficulty.current === level,
                    });
                    const properties = {
                      field: "difficulty",
                      value: level,
                      recommended_difficulty: recommendation.difficulty,
                      ...analyticsLaunchContext,
                    } as const;
                    trackInterviewLaunchEvent(
                      "new_interview_recommendation_changed",
                      properties
                    );

                    setDifficulty(level);
                  }}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {!matchesRecommendation && (
            <motion.div variants={fadeInUp}>
              <Button
                type="button"
                variant="link"
                className="text-dashboard-accent h-auto min-h-11 px-0"
                onClick={() => {
                  roundCustomized.current = true;
                  difficultyCustomized.current = true;
                  setRoundType(recommendation.roundType);
                  setDifficulty(recommendation.difficulty);
                }}
              >
                Restore recommended setup
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Tier Upgrade Modal */}
      {tierUpgradeInfo && (
        <TierUpgradeModal
          isOpen={showTierUpgradeModal}
          onClose={() => setShowTierUpgradeModal(false)}
          requestedType={tierUpgradeInfo.requestedType}
          currentTier={tierUpgradeInfo.currentTier}
          message={tierUpgradeInfo.message}
          returnFocusRef={startInterviewButtonRef}
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
          returnFocusRef={startInterviewButtonRef}
        />
      )}
    </DashboardPage>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function checkMicrophonePermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of new Set(stream.getTracks())) {
    try {
      track.stop();
    } catch {
      // Continue releasing the remaining permission-check tracks.
    }
  }
}

function trackStartStage(
  stage: "launch_request" | "launch_recovery",
  outcome: InterviewStartStageOutcome,
  durationMs: number
) {
  const event = buildInterviewStartStageEvent({
    stage,
    outcome,
    durationMs,
  });
  if (!event) return;
  analytics.track("interview_start_stage", {
    version: event.version,
    stage: event.stage,
    outcome: event.outcome,
    duration_ms: event.durationMs,
    slo_target_ms: event.sloTargetMs,
    slo_upper_bound_ms: event.sloUpperBoundMs,
    latency_class: event.latencyClass,
  });
}

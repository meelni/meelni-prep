"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import {
  DEFAULT_CONFIG,
  InterviewConfig,
  QuestionPreference,
  RoundType,
  DifficultyLevel,
  getDefaultDuration,
  getRecentDays,
} from "@/lib/interview-config";
import { validateSessionStart } from "@/lib/validation/setup-schema";
import { RoundSelector } from "./components/round-selector";
import { DifficultySelector } from "./components/difficulty-selector";
import { QuestionPoolSelector } from "./components/question-pool-selector";
import { VoiceSelector } from "./components/voice-selector";
import { AdvancedSettings } from "./components/advanced-settings";
import { SetupSummary } from "./components/setup-summary";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { useSetupPersistence } from "@/lib/hooks/use-setup-persistence";

const VOICE_NAMES: Record<string, string> = {
  "6ccbfb76-1fc6-48f7-b71d-91ac6298247b": "Tessa",
  "f9e3eb4c-ab3f-4db1-9c48-c7b806b080b1": "British Male",
  "63ff761f-c1e8-414b-b969-d1833d1c870c": "Conversational Male",
  "821fb995-1ba6-4dc9-ab71-7df7c1fe4710": "Professional Female",
};

export default function SetupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Multi-step state
  const [step, setStep] = useState(1);
  const [roundType, setRoundType] = useState<RoundType | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
  const [config, setConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup persistence hook
  const { loadState, saveState, clearState, isInitialized, setIsInitialized } = useSetupPersistence();

  // Load persisted state on mount
  useEffect(() => {
    if (!isInitialized) {
      const savedState = loadState();
      if (savedState) {
        setStep(savedState.step);
        setRoundType(savedState.roundType);
        setDifficulty(savedState.difficulty);
        setConfig(savedState.config);
      }
      setIsInitialized(true);
    }
  }, [isInitialized, loadState, setIsInitialized]);

  // Save state whenever it changes
  useEffect(() => {
    if (isInitialized) {
      saveState({ step, roundType, difficulty, config });
    }
  }, [step, roundType, difficulty, config, isInitialized, saveState]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin?redirectTo=/setup");
    }
  }, [user, authLoading, router]);

  // Update duration when round type changes
  useEffect(() => {
    if (roundType) {
      setConfig((prev) => ({
        ...prev,
        duration: getDefaultDuration(roundType),
      }));
    }
  }, [roundType]);

  const handleConfigChange = (updates: Partial<InterviewConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleQuestionPrefChange = (recency: "all" | "recent" | "very_recent") => {
    handleConfigChange({
      questionPreference: {
        recency,
        recentDays: getRecentDays(recency),
      },
    });
  };

  const handleStartInterview = async () => {
    if (!roundType || !difficulty) {
      setError("Please complete all required fields");
      return;
    }

    setIsCreatingSession(true);
    setError(null);

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

      // Prepare session data
      const sessionData = {
        roundType,
        mode: "voice_video" as const,
        persona: undefined,
        config,
      };

      // Validate data
      const validation = validateSessionStart(sessionData);
      if (!validation.success) {
        setError(validation.error);
        setIsCreatingSession(false);
        return;
      }

      // Call session start API (Agent 3's endpoint)
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start session");
      }

      const { sessionId, token, url, roomName } =
        await response.json();

      // Clear saved state since we're starting the interview
      clearState();

      // Navigate to interview page with session data
      router.push(
        "/interview?sessionId=" + sessionId + "&token=" + encodeURIComponent(token) + "&url=" + encodeURIComponent(url) + "&room=" + roomName
      );
    } catch (err) {
      console.error("Failed to start session:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start interview"
      );
      setIsCreatingSession(false);
    }
  };

  const canProceedToStep2 = roundType !== null;
  const canProceedToStep3 = canProceedToStep2 && difficulty !== null;

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
      <main className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="space-y-8"
        >
          {/* Title */}
          <motion.div variants={fadeInUp} className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="gradient-text">Setup Your Interview</span>
            </h1>
            <p className="text-muted-foreground">
              Customize your practice session in just a few steps
            </p>
          </motion.div>

          {/* Progress Indicator */}
          <motion.div variants={fadeInUp} className="flex items-center gap-3">
            {[
              { num: 1, label: "Type" },
              { num: 2, label: "Difficulty" },
              { num: 3, label: "Questions" },
              { num: 4, label: "Voice" },
              { num: 5, label: "Review" },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all " + (step >= s.num ? "bg-primary text-white" : "bg-muted text-muted-foreground")}
                  >
                    {step > s.num ? (
                      <Check className="w-4 h-4" strokeWidth={3} />
                    ) : (
                      s.num
                    )}
                  </div>
                  <span
                    className={"text-sm font-medium hidden sm:inline " + (step >= s.num ? "text-foreground" : "text-muted-foreground")}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 4 && (
                  <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={"h-full bg-primary transition-all duration-300 " + (step > s.num ? "w-full" : "w-0")}
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
                className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {/* Step 1: Round Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">
                    Choose Interview Type
                  </h2>
                  <p className="text-muted-foreground">
                    Select the type of interview you want to practice
                  </p>
                </div>
                <RoundSelector
                  selected={roundType}
                  onSelect={setRoundType}
                />
              </motion.div>
            )}

            {/* Step 2: Difficulty */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <DifficultySelector
                  selected={difficulty}
                  onSelect={setDifficulty}
                />
              </motion.div>
            )}

            {/* Step 3: Question Pool */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <QuestionPoolSelector
                  selected={config.questionPreference?.recency || "very_recent"}
                  onSelect={handleQuestionPrefChange}
                />
              </motion.div>
            )}

            {/* Step 4: Voice & Advanced Settings */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <VoiceSelector
                  selected={config.voice}
                  onSelect={(voice) => handleConfigChange({ voice })}
                />
                <AdvancedSettings
                  config={config}
                  onChange={handleConfigChange}
                />
              </motion.div>
            )}

            {/* Step 5: Summary */}
            {step === 5 && roundType && difficulty && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <SetupSummary
                  roundType={roundType}
                  difficulty={difficulty}
                  config={config}
                  voiceName={VOICE_NAMES[config.voice] || "Tessa"}
                  onStart={handleStartInterview}
                  onBack={() => setStep(4)}
                  isLoading={isCreatingSession}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          {step < 5 && (
            <motion.div
              variants={fadeInUp}
              className="flex items-center gap-3 pt-4"
            >
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              <Button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !canProceedToStep2) ||
                  (step === 2 && !canProceedToStep3)
                }
                className="flex-1"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

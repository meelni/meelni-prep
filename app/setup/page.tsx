"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import {
  buildFullConfig,
  MinimalInterviewConfig,
  RoundType,
  DifficultyLevel,
} from "@/lib/interview-config";
import { validateSessionStart } from "@/lib/validation/setup-schema";
import { RoundSelector } from "./components/round-selector";
import { DifficultySelector } from "./components/difficulty-selector";
import { fadeInUp, staggerContainer } from "@/lib/animations";

export default function SetupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Simplified 2-step state
  const [step, setStep] = useState<1 | 2>(1);
  const [roundType, setRoundType] = useState<RoundType | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin?redirectTo=/setup");
    }
  }, [user, authLoading, router]);

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
              Two quick choices and you're ready to practice
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
                        ? "bg-primary text-white"
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
                className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm"
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

            {/* Step 2: Difficulty Level */}
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

          {/* System Optimization Notice */}
          <motion.div
            variants={fadeInUp}
            className="mt-8 p-4 rounded-lg bg-muted/50 border border-border/50"
          >
            <p className="text-sm text-muted-foreground text-center">
              ✨ Voice, speech speed, and all technical settings are automatically optimized for the best experience
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

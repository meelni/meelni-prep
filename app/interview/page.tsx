"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { sessionKeys } from "@/lib/api/queries";
import {
  LiveKitRoomWrapper,
  TranscriptTurn,
} from "@/components/interview/livekit-room";
import { TranscriptPanel } from "./components/transcript-panel";
import { AudioVisualizer } from "./components/audio-visualizer";
import { InterviewControls } from "./components/interview-controls";
import { TimerDisplay } from "./components/timer-display";
import { EndSessionModal } from "./components/end-session-modal";
import { ConnectionIndicator } from "./components/connection-indicator";
import {
  NudgeOverlay,
  Nudge,
  FrameworkCoverage,
} from "@/components/interview/nudge-overlay";
import { useLocalParticipant } from "@livekit/components-react";
import { RoomAudioRenderer } from "@livekit/components-react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { getTranscriptQueue } from "@/lib/utils/transcript-queue";
import { analytics } from "@/lib/analytics/analytics-service";

interface InterviewSession {
  id: string;
  livekit_room_name: string;
  started_at: string;
  config: {
    duration?: number;
    difficulty?: string;
    mode?: string;
    roundType?: string;
    [key: string]: unknown;
  };
  question?: {
    id: string;
    text: string;
    company: string | null;
  } | null;
}

function InterviewPageContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Track Web Vitals performance
  useWebVitals("interview");

  // Config from Setup Modal (query params)
  const roundType = searchParams.get("roundType");
  const modeParam = searchParams.get("mode");
  // Ensure mode is valid (fallback for cached URLs with "mock_interview")
  const mode = modeParam === "mock_interview" ? "voice_video" : modeParam;
  const voice = searchParams.get("voice");
  const speed = searchParams.get("speed");
  const emotion = searchParams.get("emotion");
  const questionId = searchParams.get("questionId"); // Optional: pre-selected question

  // Session info (after session is created)
  const sessionId = searchParams.get("sessionId");
  const tokenParam = searchParams.get("token");
  const urlParam = searchParams.get("url");

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [token, setToken] = useState<string>(tokenParam || "");
  const [url, setUrl] = useState<string>(urlParam || "");
  const [agentState, setAgentState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptSaveErrors, setTranscriptSaveErrors] = useState(0);
  const [transcriptQueue] = useState(() => getTranscriptQueue());
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);
  const [frameworkCoverage, setFrameworkCoverage] = useState<FrameworkCoverage>(
    []
  );
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const initializedRef = useRef(false);

  // Invalidate queries when component unmounts (user leaves interview)
  useEffect(() => {
    return () => {
      console.log("Interview page unmounting, invalidating sessions queries");
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    };
  }, [queryClient]);

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current) return;

    if (authLoading) return;

    if (!user) {
      router.push("/auth/signin?redirectTo=/interview");
      return;
    }

    // Case 1: Config params present (from Setup Modal) → create session
    if (roundType && mode && !sessionId) {
      createSession();
      initializedRef.current = true;
      return;
    }

    // Case 2: Session ID present → fetch session details
    if (sessionId && tokenParam && urlParam) {
      fetchSessionDetails();
      initializedRef.current = true;
      return;
    }

    // Case 3: No valid params → redirect to dashboard
    if (!roundType && !sessionId) {
      router.push("/dashboard");
    }
  }, [roundType, mode, sessionId, tokenParam, urlParam, user, authLoading]);

  const createSession = async () => {
    if (!roundType || !mode || !user) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundType,
          mode,
          questionId: questionId || undefined, // Include questionId if present
          config: {
            voice,
            speed: speed ? parseFloat(speed) : 1.0,
            emotion: emotion || "confident",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      const data = await response.json();

      // Set state directly without navigating (prevents component remount)
      setToken(data.token);
      setUrl(data.url);
      setSession({
        id: data.sessionId,
        livekit_room_name: data.roomName,
        started_at: new Date().toISOString(),
        config: {
          ...data.config,
          roundType,
          mode,
        },
        question: data.question || null,
      });
      setSessionStartTime(Date.now());
      setLoading(false);

      // Track interview started
      analytics.track("interview_started", {
        session_id: data.sessionId,
        interview_type: roundType,
        mode: mode,
        skill_level: data.config?.difficulty,
      });
    } catch (err) {
      console.error("Error creating session:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create interview session"
      );
      setLoading(false);
    }
  };

  const fetchSessionDetails = async () => {
    if (!sessionId || !user) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/session/${sessionId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch session details");
      }

      const sessionData = await response.json();
      setSession(sessionData);
      setSessionStartTime(Date.now());
      setLoading(false);

      // Track interview started
      analytics.track("interview_started", {
        session_id: sessionId ?? session?.id ?? "",
        interview_type: sessionData.config?.roundType,
        mode: sessionData.config?.mode,
        skill_level: sessionData.config?.difficulty,
      });
    } catch (err) {
      console.error("Error fetching session:", err);
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    }
  };

  const handleTranscriptUpdate = async (turn: TranscriptTurn) => {
    // Check for duplicates first
    let isDuplicate = false;
    setTranscript((prev) => {
      // Check if this exact text already exists in the last few entries
      const lastFew = prev.slice(-5); // Check last 5 entries
      isDuplicate = lastFew.some(
        (t) => t.text === turn.text && t.speaker === turn.speaker
      );

      if (isDuplicate) {
        console.log(
          "[Interview] Skipping duplicate transcript:",
          turn.text.substring(0, 50)
        );
        return prev; // Don't add duplicate
      }

      return [...prev, turn];
    });

    // Skip database save if duplicate
    if (isDuplicate) {
      return;
    }

    // Save to database with automatic retry queue
    try {
      const result = await transcriptQueue.save({
        sessionId: sessionId!,
        speaker: turn.speaker,
        text: turn.text,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        audioMs: turn.audioMs,
        latencyMs: turn.latencyMs,
        section: turn.section || undefined,
      });

      if (!result.success) {
        // Failed, but queued for retry
        setTranscriptSaveErrors((prev) => prev + 1);
        console.warn(
          "[Interview] Transcript save failed, queued for retry:",
          result.error
        );
      } else if (transcriptSaveErrors > 0) {
        // Success after previous errors - reset error count
        setTranscriptSaveErrors(0);
      }
    } catch (error) {
      // Unexpected error
      console.error("[Interview] Unexpected error saving transcript:", error);
      setTranscriptSaveErrors((prev) => prev + 1);
    }

    // Analyze for nudges (only when user finishes speaking)
    if (turn.speaker === "user" && sessionId && session?.config?.roundType) {
      analyzeForNudges(turn);
    }
  };

  const analyzeForNudges = async (turn: TranscriptTurn) => {
    try {
      const timeElapsed = Math.floor(
        (new Date().getTime() - new Date(session!.started_at).getTime()) / 1000
      );

      const response = await fetch("/api/nudges/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId!,
          interviewType: session!.config.roundType,
          currentTurn: {
            speaker: turn.speaker,
            text: turn.text,
            timestamp: turn.timestamp,
          },
          timeElapsed,
        }),
      });

      if (!response.ok) {
        console.warn("[Interview] Nudge analysis failed:", response.statusText);
        return;
      }

      const data = await response.json();

      // Update framework coverage
      if (data.frameworkCoverage) {
        setFrameworkCoverage(data.frameworkCoverage);
      }

      // Display nudge if applicable
      if (data.shouldNudge && data.nudgeType && data.message) {
        setCurrentNudge({
          type: data.nudgeType,
          message: data.message,
        });
      }
    } catch (error) {
      console.error("[Interview] Error analyzing for nudges:", error);
      // Don't show error to user - nudges are optional enhancement
    }
  };

  const handleAgentStateChange = (state: string) => {
    const normalizedState = state.toLowerCase() as
      | "idle"
      | "listening"
      | "thinking"
      | "speaking";
    setAgentState(normalizedState);
  };

  // Auto-end session after configured duration
  useEffect(() => {
    if (!session?.started_at || !session?.config?.duration) return;

    const durationMs = session.config.duration * 60 * 1000; // Convert minutes to ms
    const startTime = new Date(session.started_at).getTime();
    const endTime = startTime + durationMs;
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) {
      // Duration already passed
      return;
    }

    // Set timer to auto-end session
    const timer = setTimeout(() => {
      console.log(
        `[Interview] Auto-ending session after ${session.config.duration} minutes`
      );
      setShowEndModal(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [session]);

  const handleEndSession = async () => {
    setIsEndingSession(true);
    try {
      // Track interview ended
      const duration = sessionStartTime
        ? (Date.now() - sessionStartTime) / 1000
        : 0;
      analytics.track("interview_ended", {
        session_id: sessionId ?? session?.id ?? "",
        duration_seconds: duration,
        ended_naturally: true,
        interview_type: session?.config?.roundType,
      });

      // End session in database
      await fetch("/api/interview/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      setShowEndModal(false);
      setIsEndingSession(false);

      // Navigate to feedback loading page
      router.push(`/feedback/${sessionId}/loading`);
    } catch (error) {
      console.error("Failed to end session:", error);
      setIsEndingSession(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading interview room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="max-w-md text-center">
          <h1 className="mb-4 text-2xl font-bold">Failed to Load Interview</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!session || !token || !url) {
    return (
      <div className="from-background via-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Connecting to room...</p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoomWrapper
      token={token}
      url={url}
      roomName={session.livekit_room_name}
      sessionId={sessionId!}
      onTranscriptUpdate={handleTranscriptUpdate}
      onAgentStateChange={handleAgentStateChange}
    >
      <RoomAudioRenderer />
      <InterviewRoomContent
        session={session}
        transcript={transcript}
        isMuted={isMuted}
        transcriptSaveErrors={transcriptSaveErrors}
        onToggleMute={() => {
          const newMutedState = !isMuted;
          setIsMuted(newMutedState);
          // Track mic toggle
          analytics.track("mic_toggled", {
            session_id: sessionId ?? session.id,
            new_state: newMutedState ? "muted" : "unmuted",
          });
        }}
        onEndSession={() => setShowEndModal(true)}
      />
      <NudgeOverlay
        nudge={currentNudge}
        frameworkCoverage={frameworkCoverage}
        onDismiss={() => setCurrentNudge(null)}
      />
      <EndSessionModal
        isOpen={showEndModal}
        isLoading={isEndingSession}
        onClose={() => setShowEndModal(false)}
        onConfirm={handleEndSession}
      />
    </LiveKitRoomWrapper>
  );
}

interface InterviewRoomContentProps {
  session: InterviewSession;
  transcript: TranscriptTurn[];
  isMuted: boolean;
  transcriptSaveErrors: number;
  onToggleMute: () => void;
  onEndSession: () => void;
}

function InterviewRoomContent({
  session,
  transcript,
  isMuted,
  transcriptSaveErrors,
  onToggleMute,
  onEndSession,
}: InterviewRoomContentProps) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted);
    }
  }, [isMuted, localParticipant]);

  const estimatedDuration = session.config?.duration || 30;

  return (
    <div className="from-background via-background to-muted/20 min-h-screen bg-gradient-to-b">
      {/* Header */}
      <header className="bg-background/80 border-border/50 sticky top-0 z-40 w-full border-b backdrop-blur-md">
        <div className="container mx-auto h-16 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-4">
              <ConnectionIndicator />
              {session.config?.roundType && (
                <div className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
                  <span className="text-primary font-medium">
                    {session.config.roundType
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                  {session.config.mode && (
                    <>
                      <span>•</span>
                      <span>
                        {session.config.mode
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </span>
                    </>
                  )}
                </div>
              )}
              {transcriptSaveErrors > 0 && (
                <StatusPill tone="warning" className="text-sm">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Saving transcript...</span>
                  <span className="sm:hidden">{transcriptSaveErrors}</span>
                </StatusPill>
              )}
            </div>
            <TimerDisplay
              startedAt={new Date(session.started_at)}
              estimatedDuration={estimatedDuration}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Question Display */}
        {session.question && (
          <AppSurface variant="accent" size="lg" className="mb-6 rounded-xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <StatusPill
                  tone="primary"
                  className="font-semibold tracking-wider uppercase"
                >
                  Interview Question
                </StatusPill>
                {session.question.company && (
                  <StatusPill tone="muted">
                    {session.question.company}
                  </StatusPill>
                )}
              </div>
            </div>
            <p className="text-foreground/90 text-base leading-relaxed whitespace-pre-wrap">
              {session.question.text}
            </p>
          </AppSurface>
        )}

        {/* Grid Layout: AudioVisualizer (with Orb) + Transcript Sidebar */}
        <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Center: AudioVisualizer (contains Orb + state indicators) + Controls */}
          <div className="flex flex-col items-center justify-center gap-12 lg:col-span-2">
            <div className="h-full max-h-[500px] w-full">
              <AudioVisualizer />
            </div>
            <InterviewControls
              isMuted={isMuted}
              onToggleMute={onToggleMute}
              onEndSession={onEndSession}
            />
          </div>

          {/* Right Sidebar: Transcript */}
          <AppSurface
            variant="panel"
            size="none"
            className="overflow-hidden rounded-xl lg:col-span-1"
          >
            <AppSurfaceHeader>
              <AppSurfaceTitle>Transcript</AppSurfaceTitle>
              <AppSurfaceDescription>
                Live conversation transcript
              </AppSurfaceDescription>
            </AppSurfaceHeader>
            <div className="h-[calc(100%-80px)]">
              <TranscriptPanel turns={transcript} />
            </div>
          </AppSurface>
        </div>
      </main>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p className="text-muted-foreground">Loading interview...</p>
          </div>
        </div>
      }
    >
      <InterviewPageContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { sessionKeys } from "@/lib/api/queries";
import { LiveKitRoomWrapper, TranscriptTurn } from "@/components/interview/livekit-room";
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
import { getTranscriptQueue } from "@/lib/utils/transcript-queue";

interface InterviewSession {
  id: string;
  livekit_room_name: string;
  started_at: string;
  config: any;
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
  useWebVitals('interview');

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
  const [frameworkCoverage, setFrameworkCoverage] = useState<FrameworkCoverage>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  // Invalidate queries when component unmounts (user leaves interview)
  useEffect(() => {
    return () => {
      console.log("Interview page unmounting, invalidating sessions queries");
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    };
  }, [queryClient]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/signin?redirectTo=/interview");
      return;
    }

    // Case 1: Config params present (from Setup Modal) → create session
    if (roundType && mode && !sessionId) {
      createSession();
      return;
    }

    // Case 2: Session ID present → fetch session details
    if (sessionId && tokenParam && urlParam) {
      fetchSessionDetails();
      return;
    }

    // Case 3: No config and no session → redirect to dashboard
    router.push("/dashboard");
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

      // Update URL with session info (replace current history entry)
      const newParams = new URLSearchParams({
        sessionId: data.sessionId,
        token: data.token,
        url: data.url,
      });
      router.replace(`/interview?${newParams.toString()}`);

      // Set state
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
      setLoading(false);
    } catch (err) {
      console.error("Error creating session:", err);
      setError(err instanceof Error ? err.message : "Failed to create interview session");
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
      const { analytics } = require('@/lib/analytics/analytics-service');
      analytics.track('interview_started', {
        session_id: sessionId,
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
        console.log("[Interview] Skipping duplicate transcript:", turn.text.substring(0, 50));
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
        console.warn("[Interview] Transcript save failed, queued for retry:", result.error);
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
      console.log(`[Interview] Auto-ending session after ${session.config.duration} minutes`);
      setShowEndModal(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [session]);

  const handleEndSession = async () => {
    setIsEndingSession(true);
    try {
      // Track interview ended
      const { analytics } = require('@/lib/analytics/analytics-service');
      const duration = sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 0;
      analytics.track('interview_ended', {
        session_id: sessionId,
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-muted/20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading interview room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-muted/20">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Failed to Load Interview</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!session || !token || !url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-muted/20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
          const { analytics } = require('@/lib/analytics/analytics-service');
          analytics.track('mic_toggled', {
            session_id: sessionId,
            new_state: newMutedState ? 'muted' : 'unmuted',
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center gap-4">
              <ConnectionIndicator />
              {session.config?.roundType && (
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-primary font-medium">
                    {session.config.roundType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                  {session.config.mode && (
                    <>
                      <span>•</span>
                      <span>{session.config.mode.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                    </>
                  )}
                </div>
              )}
              {transcriptSaveErrors > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Saving transcript...</span>
                  <span className="sm:hidden">{transcriptSaveErrors}</span>
                </div>
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
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Question Display */}
        {session.question && (
          <div className="mb-6 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-primary/10 border border-primary/30 rounded-full">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Interview Question
                  </span>
                </div>
                {session.question.company && (
                  <div className="px-3 py-1 bg-background/50 border border-border rounded-full">
                    <span className="text-xs font-medium text-muted-foreground">
                      {session.question.company}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {session.question.text}
            </p>
          </div>
        )}

        {/* Grid Layout: AudioVisualizer (with Orb) + Transcript Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          {/* Center: AudioVisualizer (contains Orb + state indicators) + Controls */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center gap-12">
            <div className="w-full h-full max-h-[500px]">
              <AudioVisualizer />
            </div>
            <InterviewControls
              isMuted={isMuted}
              onToggleMute={onToggleMute}
              onEndSession={onEndSession}
            />
          </div>

          {/* Right Sidebar: Transcript */}
          <div className="lg:col-span-1 bg-surface border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/50">
              <h2 className="text-lg font-semibold">Transcript</h2>
              <p className="text-xs text-muted-foreground">Live conversation transcript</p>
            </div>
            <div className="h-[calc(100%-80px)]">
              <TranscriptPanel turns={transcript} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground">Loading interview...</p>
          </div>
        </div>
      }
    >
      <InterviewPageContent />
    </Suspense>
  );
}

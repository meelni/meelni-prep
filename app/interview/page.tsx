"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth-provider";
import { LiveKitRoomWrapper, TranscriptTurn } from "@/components/interview/livekit-room";
import { AgentStatus } from "./components/agent-status";
import { TranscriptPanel } from "./components/transcript-panel";
import { AudioVisualizer } from "./components/audio-visualizer";
import { InterviewControls } from "./components/interview-controls";
import { TimerDisplay } from "./components/timer-display";
import { EndSessionModal } from "./components/end-session-modal";
import { useLocalParticipant } from "@livekit/components-react";
import { RoomAudioRenderer } from "@livekit/components-react";
import { Loader2 } from "lucide-react";

interface InterviewSession {
  id: string;
  livekit_room_name: string;
  started_at: string;
  config: any;
}

export default function InterviewPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/signin?redirectTo=/interview");
      return;
    }

    if (!sessionId || !tokenParam || !urlParam) {
      router.push("/setup");
      return;
    }

    fetchSessionDetails();
  }, [sessionId, tokenParam, urlParam, user, authLoading]);

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
      setLoading(false);
    } catch (err) {
      console.error("Error fetching session:", err);
      setError(err instanceof Error ? err.message : "Failed to load interview");
      setLoading(false);
    }
  };

  const handleTranscriptUpdate = async (turn: TranscriptTurn) => {
    setTranscript((prev) => [...prev, turn]);

    // Save to database
    try {
      await fetch("/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          speaker: turn.speaker,
          text: turn.text,
          startedAt: turn.startedAt.toISOString(),
          endedAt: turn.endedAt.toISOString(),
          audioMs: turn.audioMs,
          latencyMs: turn.latencyMs,
          section: turn.section,
        }),
      });
    } catch (error) {
      console.error("Failed to save transcript turn:", error);
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

  const handleEndSession = async () => {
    setIsEndingSession(true);
    try {
      // End session in database
      await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      setShowEndModal(false);
      setIsEndingSession(false);

      // Navigate to feedback page
      router.push(`/feedback/${sessionId}`);
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
            onClick={() => router.push("/setup")}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Setup
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
        agentState={agentState}
        transcript={transcript}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(!isMuted)}
        onEndSession={() => setShowEndModal(true)}
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
  agentState: "idle" | "listening" | "thinking" | "speaking";
  transcript: TranscriptTurn[];
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

function InterviewRoomContent({
  session,
  agentState,
  transcript,
  isMuted,
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
            <AgentStatus state={agentState} />
            <TimerDisplay
              startedAt={new Date(session.started_at)}
              estimatedDuration={estimatedDuration}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          {/* Center: Audio Visualizer */}
          <div className="lg:col-span-2 flex items-center justify-center">
            <div className="w-full h-full max-h-[500px]">
              <AudioVisualizer />
            </div>
          </div>

          {/* Right Sidebar: Transcript */}
          <div className="lg:col-span-1 bg-surface border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/50">
              <h2 className="text-lg font-semibold">Transcript</h2>
              <p className="text-xs text-muted-foreground">
                Live conversation transcript
              </p>
            </div>
            <div className="h-[calc(100%-80px)]">
              <TranscriptPanel turns={transcript} />
            </div>
          </div>
        </div>
      </main>

      {/* Controls */}
      <InterviewControls
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        onEndSession={onEndSession}
      />
    </div>
  );
}

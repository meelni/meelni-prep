"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useConnectionState,
  useRoomContext,
  useTrackVolume,
  useLocalParticipant,
} from "@livekit/components-react";
import { Orb } from "@/components/ui/orb";
import { Track } from "livekit-client";
import { ConnectionState } from "livekit-client";
import type { Participant, TranscriptionSegment } from "livekit-client";
import { X, Mic, MicOff, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { analytics } from "@/lib/analytics/analytics-service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MEELNI_ORB_COLORS } from "@/lib/design-tokens";
import {
  interpretPublicDemoStartFailure,
  requestPublicDemoStart,
  type DemoStartError,
} from "@/lib/demo/public-demo-client";

// Transcript message type
interface TranscriptMessage {
  id: string;
  speaker: "user" | "agent";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
}

// Transcript Panel Component (Terminal-style design)
function TranscriptPanel({ messages }: { messages: TranscriptMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="border-primary-foreground/10 flex h-full flex-col border-l">
      {/* Terminal-style Header */}
      <div className="border-primary-foreground/10 border-b px-4 py-3">
        <span className="text-primary-foreground/60 font-mono text-xs">
          Live transcript
        </span>
      </div>

      {/* Messages (Terminal output style) */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4 font-mono text-sm"
      >
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center space-y-3 text-center"
          >
            <div className="text-muted-foreground/40 text-xs">
              <p>$ waiting for input...</p>
              <p className="mt-2 animate-pulse">_</p>
            </div>
          </motion.div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.speaker}-${index}`} className="space-y-1">
              {/* Terminal-style prompt */}
              <div className="flex items-baseline gap-3 text-xs leading-relaxed">
                <span
                  className={`min-w-[3rem] flex-shrink-0 font-semibold ${
                    message.speaker === "user" ? "text-success" : "text-info"
                  } ${!message.isFinal ? "opacity-50" : ""}`}
                >
                  {message.speaker === "user" ? "You" : "Meelni"}
                </span>
                <span
                  className={`flex-1 ${
                    message.isFinal
                      ? "text-primary-foreground/90"
                      : "text-primary-foreground/40 italic"
                  }`}
                >
                  {message.text}
                  {!message.isFinal && (
                    <span className="ml-1 animate-pulse">...</span>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Main Controls Component
function DemoControls({
  onClose,
  demoStartTime,
  onAgentJoined,
  onUserSpoke,
  onDemoCompleted,
  onRuntimeError,
  durationSeconds,
}: {
  onClose: () => void;
  demoStartTime: React.MutableRefObject<number | undefined>;
  onAgentJoined: () => void;
  onUserSpoke: () => void;
  onDemoCompleted: () => void;
  onRuntimeError: (error: DemoStartError) => void;
  durationSeconds: number;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(durationSeconds);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const demoCompletedTracked = useRef(false);
  const sessionEndedRef = useRef(false);
  const agentSeenRef = useRef(false);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setTimeRemaining(durationSeconds);
  }, [durationSeconds]);

  // Debounced agent state to prevent flickering during speech pauses
  const [debouncedAgentState, setDebouncedAgentState] =
    useState<string>("idle");
  const stateChangeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSpeakingTimeRef = useRef<number>(0);

  // Track agent arrival and treat an unexpected agent departure as terminal.
  useEffect(() => {
    const connected = connectionState === ConnectionState.Connected;
    const remoteCount = room?.remoteParticipants.size ?? 0;
    if (connected && remoteCount > 0) {
      agentSeenRef.current = true;
      onAgentJoined();
    }
    if (
      connected &&
      agentSeenRef.current &&
      remoteCount === 0 &&
      !sessionEndedRef.current
    ) {
      onRuntimeError({
        title: "The interviewer left the preview",
        message: "The voice session ended before the preview was complete.",
      });
    }
  }, [
    connectionState,
    onAgentJoined,
    onRuntimeError,
    room?.remoteParticipants.size,
  ]);

  // The ready control event, not transport connection alone, starts practice.
  useEffect(() => {
    if (
      connectionState !== ConnectionState.Connected ||
      agentReady ||
      sessionEndedRef.current
    ) {
      return;
    }
    const watchdog = window.setTimeout(() => {
      if (!sessionEndedRef.current) {
        onRuntimeError({
          title: "The interviewer didn't arrive",
          message: "We couldn't start the voice preview within 20 seconds.",
        });
      }
    }, 20_000);
    return () => window.clearTimeout(watchdog);
  }, [agentReady, connectionState, onRuntimeError]);

  // Sync mute state with local participant's microphone state
  useEffect(() => {
    if (localParticipant) {
      const micEnabled = localParticipant.isMicrophoneEnabled;
      setIsMuted(!micEnabled);
    }
  }, [localParticipant, localParticipant?.isMicrophoneEnabled]);

  // Audio reactivity for Orb (same as interview page)
  const userVolume = useTrackVolume(
    audioTrack?.publication?.track as Parameters<typeof useTrackVolume>[0]
  );
  const firstRemoteParticipant = room?.remoteParticipants
    ? Array.from(room.remoteParticipants.values())[0]
    : undefined;
  const agentAudioTrack = firstRemoteParticipant?.getTrackPublication(
    Track.Source.Microphone
  )?.track;
  const agentVolume = useTrackVolume(
    agentAudioTrack as Parameters<typeof useTrackVolume>[0]
  );

  // Normalize volumes from 0-100
  const normalizedUserVolume = Math.min(userVolume, 100) / 100;
  const normalizedAgentVolume = Math.min(agentVolume, 100) / 100;

  // Debounce agent state changes to prevent flickering during natural pauses
  useEffect(() => {
    const currentState = (state as string) || "idle";
    const GRACE_PERIOD_MS = 600; // 600ms grace period for natural pauses

    // If agent is speaking, update timestamp
    if (currentState === "speaking") {
      lastSpeakingTimeRef.current = Date.now();

      // Immediately show speaking state
      if (debouncedAgentState !== "speaking") {
        setDebouncedAgentState("speaking");
      }

      // Clear any pending state change
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    } else if (
      currentState !== "speaking" &&
      debouncedAgentState === "speaking"
    ) {
      // Agent stopped speaking - check if we should wait before transitioning
      const timeSinceLastSpeaking = Date.now() - lastSpeakingTimeRef.current;

      if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
        // Within grace period - delay the state change
        if (!stateChangeTimerRef.current) {
          stateChangeTimerRef.current = setTimeout(() => {
            setDebouncedAgentState(currentState);
            stateChangeTimerRef.current = undefined;
          }, GRACE_PERIOD_MS - timeSinceLastSpeaking);
        }
      } else {
        // Grace period passed - update immediately
        setDebouncedAgentState(currentState);
      }
    } else if (currentState !== "speaking") {
      // Non-speaking states (thinking, listening, idle) - update immediately
      setDebouncedAgentState(currentState);

      // Clear any pending timer
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
        stateChangeTimerRef.current = undefined;
      }
    }

    return () => {
      if (stateChangeTimerRef.current) {
        clearTimeout(stateChangeTimerRef.current);
      }
    };
  }, [state, debouncedAgentState]);

  // Timer effect - start countdown when connected
  useEffect(() => {
    const isConnected = connectionState === ConnectionState.Connected;

    if (!isConnected || !agentReady || sessionEnded) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [agentReady, connectionState, sessionEnded]);

  // Listen for transcription events
  useEffect(() => {
    if (!room) return;

    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant
    ) => {
      segments.forEach((segment) => {
        // Show both interim and final transcripts (Option A)
        if (segment.text && segment.text.trim()) {
          // Check participant identity and kind
          const isAgentParticipant =
            participant?.identity?.includes("agent") ||
            participant?.identity?.includes("Agent") ||
            participant?.name?.toLowerCase().includes("agent");

          const speaker = isAgentParticipant ? "agent" : "user";
          const messageId = `${speaker}-${Date.now()}`;

          // Track if user spoke
          if (speaker === "user" && segment.final) {
            onUserSpoke();
          }

          const newMessage: TranscriptMessage = {
            id: messageId,
            speaker: speaker,
            text: segment.text.trim(),
            timestamp: new Date(),
            isFinal: Boolean(segment.final),
          };

          setMessages((prev) => {
            // If interim (not final), update or add
            if (!segment.final) {
              // Find existing interim message for this speaker
              const existingIndex = prev.findIndex(
                (msg) => !msg.isFinal && msg.speaker === speaker
              );

              if (existingIndex !== -1) {
                // Update existing interim message
                const updated = [...prev];
                updated[existingIndex] = newMessage;
                return updated;
              } else {
                // Add new interim message
                return [...prev, newMessage];
              }
            } else {
              // Final message - remove any interim from this speaker and add final
              const withoutInterim = prev.filter(
                (msg) => msg.isFinal || msg.speaker !== speaker
              );

              // Prevent duplicate final messages
              const isDuplicate = withoutInterim.some(
                (msg) =>
                  msg.text === newMessage.text &&
                  msg.speaker === speaker &&
                  Math.abs(
                    msg.timestamp.getTime() - newMessage.timestamp.getTime()
                  ) < 1000
              );

              if (isDuplicate) return withoutInterim;
              return [...withoutInterim, newMessage];
            }
          });
        }
      });
    };

    room.on("transcriptionReceived", handleTranscription);

    return () => {
      room.off("transcriptionReceived", handleTranscription);
    };
  }, [room, onUserSpoke]);

  // The agent is authoritative for normal completion and deletes the room at
  // the hard cap. Preserve the completion state when that disconnect arrives.
  useEffect(() => {
    if (!room) return;
    const handleData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string
    ) => {
      if (topic !== "demo_control") return;
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          remaining_seconds?: number;
        };
        if (message.type === "demo_ready") {
          if (!demoStartTime.current) demoStartTime.current = Date.now();
          const remaining = message.remaining_seconds;
          if (typeof remaining === "number" && Number.isFinite(remaining)) {
            setTimeRemaining(
              Math.max(0, Math.min(durationSeconds, Math.ceil(remaining)))
            );
          }
          setAgentReady(true);
        }
        if (message.type === "session_end") {
          sessionEndedRef.current = true;
          onDemoCompleted();
          setSessionEnded(true);
        }
      } catch {
        // Ignore malformed provider data; it is not trusted UI content.
      }
    };
    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [demoStartTime, durationSeconds, onDemoCompleted, room]);

  useEffect(() => {
    if (sessionEnded) completionHeadingRef.current?.focus();
  }, [sessionEnded]);

  const toggleMute = async () => {
    if (!localParticipant) return;

    const newMutedState = !isMuted;

    // Toggle the microphone mute state
    await localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);

    // Track mic toggle
    if (demoStartTime.current) {
      const timeInDemo = (Date.now() - demoStartTime.current) / 1000;
      analytics.track("demo_mic_toggled", {
        new_state: newMutedState ? "muted" : "unmuted",
        time_in_demo_seconds: Math.floor(timeInDemo),
      });
    }
  };

  // Track demo completion when session ends
  useEffect(() => {
    if (
      sessionEnded &&
      !demoCompletedTracked.current &&
      demoStartTime.current
    ) {
      demoCompletedTracked.current = true;
      onDemoCompleted();

      const duration = (Date.now() - demoStartTime.current) / 1000;
      const turnCount = messages.filter((msg) => msg.isFinal).length;

      analytics.track("demo_completed", {
        duration_seconds: Math.floor(duration),
        turn_count: turnCount,
        converted_to_signup: false,
      });
    }
  }, [sessionEnded, demoStartTime, messages, onDemoCompleted]);

  const isConnected = connectionState === ConnectionState.Connected;
  const isReady = isConnected && agentReady;
  // Use debounced state for UI display to prevent flickering
  const agentState = debouncedAgentState;

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="from-overlay via-overlay to-primary/20 relative flex h-full w-full bg-gradient-to-br">
      {/* Main area: Centered content */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 sm:px-8 md:px-16">
        {/* Timer and Demo Badge (top-right) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute top-4 left-4 sm:top-8 sm:right-20 sm:left-auto md:top-12 md:right-24"
        >
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Preview duration badge */}
            {!isReady && !sessionEnded && (
              <div className="bg-primary/10 border-primary/20 rounded-lg border px-2 py-1.5 backdrop-blur-xl sm:rounded-xl sm:px-4 sm:py-2">
                <span className="text-label text-primary">
                  2-MIN VOICE PREVIEW
                </span>
              </div>
            )}

            {/* Countdown Timer (when connected) */}
            {isReady && !sessionEnded && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`bg-primary-foreground/5 rounded-lg border px-3 py-2 backdrop-blur-xl sm:rounded-xl sm:px-5 sm:py-2.5 ${
                  timeRemaining <= 60
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-primary-foreground/10"
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${
                      timeRemaining <= 60
                        ? "bg-destructive animate-pulse"
                        : "bg-primary"
                    }`}
                  />
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums sm:text-sm ${
                      timeRemaining <= 60
                        ? "text-destructive"
                        : "text-primary-foreground/90"
                    }`}
                  >
                    {formatTime(timeRemaining)}
                  </span>
                  <span className="text-primary-foreground/50 hidden text-xs sm:inline">
                    remaining
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Central visual area */}
        <div className="flex flex-col items-center justify-center gap-8">
          {/* Orb Visualizer */}
          <AnimatePresence mode="wait">
            {sessionEnded ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="space-y-6 text-center"
              >
                <div role="status" aria-live="polite" className="space-y-3">
                  <h2
                    ref={completionHeadingRef}
                    tabIndex={-1}
                    className="text-primary-foreground text-3xl font-semibold outline-none"
                  >
                    That&apos;s the preview.
                  </h2>
                  <p className="text-primary-foreground/60 mx-auto max-w-lg text-base">
                    A full mock interview adds realistic follow-ups, a
                    transcript, and PM-calibrated feedback.
                  </p>
                </div>
                <Link
                  href="/dashboard/new-interview?source=voice_demo"
                  onClick={() => {
                    // Track conversion to signup
                    if (demoStartTime.current) {
                      analytics.track("cta_clicked", {
                        button_text: "Practice a full interview",
                        location: "voice_preview_complete",
                        destination: "/dashboard/new-interview",
                      });
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
                >
                  Start a Mock Interview
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </motion.div>
            ) : isReady ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5, type: "spring" }}
                className="h-[250px] w-[250px] sm:h-[350px] sm:w-[350px] md:h-[400px] md:w-[400px]"
              >
                <Orb
                  colors={MEELNI_ORB_COLORS}
                  agentState={
                    agentState === "thinking"
                      ? "thinking"
                      : agentState === "listening"
                        ? "listening"
                        : agentState === "speaking"
                          ? "talking"
                          : null
                  }
                  getInputVolume={() => normalizedUserVolume}
                  getOutputVolume={() => normalizedAgentVolume}
                  className="h-full w-full"
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 text-center"
              >
                <h2 className="text-primary-foreground/90 text-2xl font-semibold">
                  Connecting...
                </h2>
                <p className="text-primary-foreground/50 max-w-md text-sm">
                  Establishing secure connection...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent Status - below orb */}
          {!sessionEnded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              aria-live="polite"
            >
              {!isReady ? (
                <div className="bg-primary-foreground/5 border-primary-foreground/10 flex items-center gap-3 rounded-2xl border px-6 py-3 backdrop-blur-xl">
                  <Loader2 className="text-primary h-4 w-4 animate-spin" />
                  <span className="text-primary-foreground/70 text-sm font-medium">
                    Connecting to Meelni...
                  </span>
                </div>
              ) : agentState === "listening" ? (
                <div className="bg-info/10 border-info/20 flex items-center gap-3 rounded-2xl border px-6 py-3 backdrop-blur-xl">
                  <div className="bg-info h-2 w-2 animate-pulse rounded-full" />
                  <span className="text-info text-sm font-medium">
                    Listening
                  </span>
                </div>
              ) : agentState === "thinking" ? (
                <div className="bg-primary/10 border-primary/20 flex items-center gap-3 rounded-2xl border px-6 py-3 backdrop-blur-xl">
                  <div className="flex gap-1">
                    <div className="bg-primary h-1.5 w-1.5 animate-bounce rounded-full" />
                    <div
                      className="bg-primary h-1.5 w-1.5 animate-bounce rounded-full"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="bg-primary h-1.5 w-1.5 animate-bounce rounded-full"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <span className="text-primary text-sm font-medium">
                    Thinking
                  </span>
                </div>
              ) : agentState === "speaking" ? (
                <div className="bg-success/10 border-success/20 flex items-center gap-3 rounded-2xl border px-6 py-3 backdrop-blur-xl">
                  <div className="bg-success h-2 w-2 animate-pulse rounded-full" />
                  <span className="text-success text-sm font-medium">
                    Speaking
                  </span>
                </div>
              ) : null}
            </motion.div>
          )}
        </div>

        {/* Bottom controls */}
        {!sessionEnded && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ delay: 0.4 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 sm:bottom-8 md:bottom-12"
          >
            <div className="bg-primary-foreground/5 border-primary-foreground/10 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-2xl sm:gap-4 sm:px-6 sm:py-4 md:px-8">
              {/* Mic button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMute}
                disabled={!isReady || !localParticipant}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                aria-pressed={isMuted}
                className={`focus-visible:ring-primary relative min-h-11 min-w-11 rounded-xl p-4 shadow-lg transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none ${
                  isMuted
                    ? "bg-destructive/80 hover:bg-destructive"
                    : "bg-primary-foreground/10 hover:bg-primary-foreground/20"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isMuted ? (
                  <MicOff
                    className="text-primary-foreground h-5 w-5"
                    aria-hidden="true"
                  />
                ) : (
                  <Mic
                    className="text-primary-foreground h-5 w-5"
                    aria-hidden="true"
                  />
                )}
                {!isMuted && isReady && (
                  <div className="bg-success absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full" />
                )}
              </motion.button>

              {/* Divider */}
              <div className="bg-primary-foreground/10 h-8 w-px" />

              {/* Close button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                aria-label="End voice preview"
                className="bg-primary-foreground/10 hover:bg-primary-foreground/20 focus-visible:ring-primary min-h-11 min-w-11 rounded-xl p-4 shadow-lg transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
              >
                <X
                  className="text-primary-foreground h-5 w-5"
                  aria-hidden="true"
                />
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Right sidebar: Transcript (terminal-style) - Hidden on mobile */}
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="border-border/50 hidden w-[400px] border-l lg:block"
      >
        <TranscriptPanel messages={messages} />
      </motion.div>
    </div>
  );
}

export function DemoModal({ isOpen, onClose, returnFocusRef }: DemoModalProps) {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [error, setError] = useState<DemoStartError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const modalOpenedAt = useRef<number | undefined>(undefined);
  const demoStartTime = useRef<number | undefined>(undefined);
  const [agentJoined, setAgentJoined] = useState(false);
  const [userSpoke, setUserSpoke] = useState(false);
  const [demoCompleted, setDemoCompleted] = useState(false);
  const demoCompletedRef = useRef(false);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const tokenRequestRef = useRef<AbortController | null>(null);
  const openedRequestStartedRef = useRef(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (!error?.retryAt) {
      setCooldownSeconds(0);
      return;
    }
    const update = () =>
      setCooldownSeconds(
        Math.max(0, Math.ceil((error.retryAt! - Date.now()) / 1000))
      );
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [error?.retryAt]);

  useEffect(() => {
    if (error) errorHeadingRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (isOpen) {
      modalOpenedAt.current = Date.now();
      demoStartTime.current = undefined;
      analytics.track("demo_modal_opened", { trigger_source: "landing_hero" });
    }
  }, [isOpen]);

  const fetchDemoToken = useCallback(async () => {
    if (tokenRequestRef.current || cooldownSeconds > 0) return;
    const controller = new AbortController();
    let requestTimedOut = false;
    const requestTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, 15_000);
    tokenRequestRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const result = await requestPublicDemoStart({
        signal: controller.signal,
      });
      if (!result.ok) {
        setError(
          interpretPublicDemoStartFailure({
            status: result.status,
            body: result.body,
            retryAfterHeader: result.retryAfterHeader,
          })
        );
        return;
      }
      setToken(result.data.token);
      setUrl(result.data.url);
      setDurationSeconds(result.data.durationSeconds);
    } catch {
      if (controller.signal.aborted && !requestTimedOut) return;
      setError({
        title: requestTimedOut
          ? "The voice preview took too long to start"
          : "The voice preview is temporarily unavailable",
        message: requestTimedOut
          ? "We stopped waiting after 15 seconds. You can try again."
          : "Your microphone is fine—we couldn't connect to the interviewer.",
      });
    } finally {
      window.clearTimeout(requestTimeout);
      tokenRequestRef.current = null;
      setIsLoading(false);
    }
  }, [cooldownSeconds]);

  const handleRuntimeError = useCallback((nextError: DemoStartError) => {
    setToken("");
    setUrl("");
    setError(nextError);
  }, []);

  const handleAgentJoined = useCallback(() => setAgentJoined(true), []);
  const handleUserSpoke = useCallback(() => setUserSpoke(true), []);
  const handleDemoCompleted = useCallback(() => {
    demoCompletedRef.current = true;
    setDemoCompleted(true);
  }, []);

  const handleClose = useCallback(() => {
    tokenRequestRef.current?.abort();
    tokenRequestRef.current = null;
    // Track demo close
    if (modalOpenedAt.current) {
      const duration = (Date.now() - modalOpenedAt.current) / 1000;

      analytics.track("demo_modal_closed", {
        duration_seconds: Math.floor(duration),
        completed: demoCompleted,
        agent_joined: agentJoined,
        user_spoke: userSpoke,
      });
    }

    // Reset state when closing
    setToken("");
    setUrl("");
    setError(null);
    setAgentJoined(false);
    setUserSpoke(false);
    setDemoCompleted(false);
    modalOpenedAt.current = undefined;
    demoStartTime.current = undefined;
    demoCompletedRef.current = false;
    openedRequestStartedRef.current = false;
    onClose();
  }, [agentJoined, demoCompleted, onClose, userSpoke]);

  // Fetch demo token when modal opens
  useEffect(() => {
    if (isOpen && !token && !openedRequestStartedRef.current) {
      openedRequestStartedRef.current = true;
      fetchDemoToken();
    }
  }, [fetchDemoToken, isOpen, token]);

  return (
    <MotionConfig reducedMotion="user">
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent
          aria-modal="true"
          overlayClassName="z-[9999] bg-overlay/95"
          closeClassName="z-[70] bg-primary-foreground/10 text-primary-foreground opacity-100 hover:bg-primary-foreground/20"
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return;
            event.preventDefault();
            returnFocusRef.current.focus();
          }}
          className="border-primary-foreground/10 from-overlay via-overlay to-primary/20 z-[10000] block h-[calc(100dvh_-_2rem)] max-h-[900px] max-w-[1600px] overflow-hidden rounded-2xl bg-gradient-to-br p-0 shadow-2xl"
        >
          <DialogTitle className="sr-only">Meelni voice demo</DialogTitle>
          <DialogDescription className="sr-only">
            Answer one PM interview question out loud in a two-minute voice
            preview. This preview is not saved.
          </DialogDescription>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-primary-foreground/5 border-primary-foreground/10 text-primary-foreground/60 absolute bottom-4 left-4 z-50 hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs backdrop-blur-xl sm:bottom-6 sm:left-6 sm:flex"
          >
            <kbd className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground/80 rounded border px-2 py-1 font-mono">
              ESC
            </kbd>
            <span>to close</span>
          </motion.div>

          {error ? (
            <div className="flex h-full items-center justify-center">
              <div className="space-y-4 text-center">
                <div className="bg-destructive/20 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
                  <X className="text-destructive h-8 w-8" aria-hidden="true" />
                </div>
                <div role="alert" className="space-y-2">
                  <h3
                    ref={errorHeadingRef}
                    tabIndex={-1}
                    className="text-primary-foreground text-xl font-semibold outline-none"
                  >
                    {error.title}
                  </h3>
                  <p className="text-primary-foreground/70 text-sm">
                    {error.message}
                  </p>
                </div>
                {!error.paused && cooldownSeconds > 0 && (
                  <p className="text-primary-foreground/70 text-sm">
                    Try again in {formatCooldown(cooldownSeconds)}. You can
                    still start a full mock interview now.
                  </p>
                )}
                {error.paused ? (
                  <Button
                    type="button"
                    onClick={handleClose}
                    size="lg"
                    className="min-h-11 rounded-xl font-semibold"
                  >
                    Close
                  </Button>
                ) : (
                  <div className="flex flex-col justify-center gap-3 sm:flex-row">
                    <Button
                      type="button"
                      onClick={fetchDemoToken}
                      disabled={cooldownSeconds > 0 || isLoading}
                      size="lg"
                      className="min-h-11 rounded-xl font-semibold"
                    >
                      {cooldownSeconds > 0
                        ? `Try again in ${formatCooldown(cooldownSeconds)}`
                        : "Try Again"}
                    </Button>
                    <Button asChild variant="secondary" size="lg">
                      <Link href="/dashboard/new-interview?source=voice_demo">
                        Start a Mock Interview
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : isLoading || !token ? (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="flex h-full flex-col items-center justify-center gap-6"
            >
              <Loader2
                className="text-primary h-12 w-12 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <p className="text-primary-foreground/80 font-medium">
                Connecting to Meelni...
              </p>
            </div>
          ) : (
            <LiveKitRoom
              token={token}
              serverUrl={url}
              connect={true}
              audio={true}
              video={false}
              onDisconnected={() => {
                if (!demoCompletedRef.current) {
                  handleRuntimeError({
                    title: "The connection dropped",
                    message:
                      "We didn't count this as a completed preview. You can try again.",
                  });
                }
              }}
              onError={() =>
                handleRuntimeError({
                  title: "The voice connection failed",
                  message:
                    "We couldn't keep the interviewer connected. You can try again.",
                })
              }
              onMediaDeviceFailure={() =>
                handleRuntimeError({
                  title: "Microphone access is required",
                  message:
                    "Allow microphone access in your browser, then try the voice preview again.",
                })
              }
              className="h-full w-full"
            >
              <DemoControls
                onClose={handleClose}
                demoStartTime={demoStartTime}
                onAgentJoined={handleAgentJoined}
                onUserSpoke={handleUserSpoke}
                onDemoCompleted={handleDemoCompleted}
                onRuntimeError={handleRuntimeError}
                durationSeconds={durationSeconds}
              />
              <RoomAudioRenderer />
            </LiveKitRoom>
          )}
        </DialogContent>
      </Dialog>
    </MotionConfig>
  );
}

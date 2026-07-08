"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import { MEELNI_ORB_COLORS } from "@/lib/design-tokens";

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
          transcript.log
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
                  {message.speaker === "user" ? "user" : "agent"}
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
}: {
  onClose: () => void;
  demoStartTime: React.MutableRefObject<number | undefined>;
  onAgentJoined: () => void;
  onUserSpoke: () => void;
  onDemoCompleted: () => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [sessionEnded, setSessionEnded] = useState(false);
  const demoCompletedTracked = useRef(false);

  // Debounced agent state to prevent flickering during speech pauses
  const [debouncedAgentState, setDebouncedAgentState] =
    useState<string>("idle");
  const stateChangeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSpeakingTimeRef = useRef<number>(0);

  // Track agent join
  useEffect(() => {
    if (
      connectionState === ConnectionState.Connected &&
      room?.remoteParticipants.size > 0
    ) {
      onAgentJoined();
    }
  }, [connectionState, room?.remoteParticipants.size, onAgentJoined]);

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

    if (!isConnected || sessionEnded) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setSessionEnded(true);
          clearInterval(interval);
          // Disconnect room after timeout
          if (room) {
            room.disconnect();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState, room, sessionEnded]);

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
        converted_to_signup: false, // Will be updated if user clicks "Start Full Interview"
      });
    }
  }, [sessionEnded, demoStartTime, messages, onDemoCompleted]);

  const isConnected = connectionState === ConnectionState.Connected;
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
          className="absolute top-4 right-4 sm:top-8 sm:right-8 md:top-12 md:right-12"
        >
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 5-Minute Demo Badge */}
            {!isConnected && !sessionEnded && (
              <div className="bg-primary/10 border-primary/20 rounded-lg border px-2 py-1.5 backdrop-blur-xl sm:rounded-xl sm:px-4 sm:py-2">
                <span className="text-label text-primary">5-MIN DEMO</span>
              </div>
            )}

            {/* Countdown Timer (when connected) */}
            {isConnected && !sessionEnded && (
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
                <div className="space-y-3">
                  <h2 className="text-primary-foreground text-3xl font-semibold">
                    Demo Complete!
                  </h2>
                  <p className="text-primary-foreground/60 mx-auto max-w-lg text-base">
                    Thank you for trying Meelni. Ready to practice with a full
                    interview?
                  </p>
                </div>
                <Link
                  href="/dashboard/new-rep"
                  onClick={() => {
                    // Track conversion to signup
                    if (demoStartTime.current) {
                      analytics.track("demo_completed", {
                        duration_seconds: Math.floor(
                          (Date.now() - demoStartTime.current) / 1000
                        ),
                        turn_count: messages.filter((msg) => msg.isFinal)
                          .length,
                        converted_to_signup: true,
                      });
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
                >
                  Start Full Interview
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </motion.div>
            ) : isConnected ? (
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
            >
              {!isConnected ? (
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMute}
                disabled={!isConnected || !localParticipant}
                className={`relative rounded-xl p-4 shadow-lg transition-all duration-300 ${
                  isMuted
                    ? "bg-destructive/80 hover:bg-destructive"
                    : "bg-primary-foreground/10 hover:bg-primary-foreground/20"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isMuted ? (
                  <MicOff className="text-primary-foreground h-5 w-5" />
                ) : (
                  <Mic className="text-primary-foreground h-5 w-5" />
                )}
                {!isMuted && isConnected && (
                  <div className="bg-success absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full" />
                )}
              </motion.button>

              {/* Divider */}
              <div className="bg-primary-foreground/10 h-8 w-px" />

              {/* Close button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-xl p-4 shadow-lg transition-all duration-300"
              >
                <X className="text-primary-foreground h-5 w-5" />
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

export function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const demoStartTime = useRef<number | undefined>(undefined);
  const [agentJoined, setAgentJoined] = useState(false);
  const [userSpoke, setUserSpoke] = useState(false);
  const [demoCompleted, setDemoCompleted] = useState(false);

  // Body scroll lock and start time tracking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      demoStartTime.current = Date.now();
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const fetchDemoToken = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/livekit/demo-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName:
            "demo-user-" + Math.random().toString(36).substring(7),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get demo token");
      }

      const data = await response.json();
      setToken(data.token);
      setUrl(data.url);
    } catch (err) {
      console.error("Demo token error:", err);
      setError("Failed to start demo. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    // Track demo close
    if (demoStartTime.current) {
      const duration = (Date.now() - demoStartTime.current) / 1000;

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
    setError("");
    setAgentJoined(false);
    setUserSpoke(false);
    setDemoCompleted(false);
    onClose();
  }, [agentJoined, demoCompleted, onClose, userSpoke]);

  // Fetch demo token when modal opens
  useEffect(() => {
    if (isOpen && !token) {
      fetchDemoToken();
    }
  }, [fetchDemoToken, isOpen, token]);

  // ESC key listener to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscKey);
    }

    return () => {
      window.removeEventListener("keydown", handleEscKey);
    };
  }, [handleClose, isOpen]);

  // Only render portal on client-side after mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Full-screen dark backdrop - blurs everything */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-overlay/95 fixed inset-0 z-[9999] backdrop-blur-sm"
          />

          {/* Full-screen Modal Container (LiveKit style) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          >
            {/* Inner modal with border/frame */}
            <div className="border-primary-foreground/10 from-overlay via-overlay to-primary/20 relative h-full max-h-[900px] w-full max-w-[1600px] overflow-hidden rounded-2xl border bg-gradient-to-br shadow-2xl">
              {/* Keyboard shortcut hint - bottom left - Hidden on mobile */}
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
                      <X className="text-destructive h-8 w-8" />
                    </div>
                    <p className="text-destructive font-medium">{error}</p>
                    <Button
                      type="button"
                      onClick={fetchDemoToken}
                      size="lg"
                      className="rounded-xl font-semibold"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              ) : isLoading || !token ? (
                <div className="flex h-full flex-col items-center justify-center gap-6">
                  <Loader2 className="text-primary h-12 w-12 animate-spin" />
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
                  onDisconnected={handleClose}
                  className="h-full w-full"
                >
                  <DemoControls
                    onClose={handleClose}
                    demoStartTime={demoStartTime}
                    onAgentJoined={() => setAgentJoined(true)}
                    onUserSpoke={() => setUserSpoke(true)}
                    onDemoCompleted={() => setDemoCompleted(true)}
                  />
                  <RoomAudioRenderer />
                </LiveKitRoom>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

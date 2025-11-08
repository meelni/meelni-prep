"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useConnectionState,
  useRoomContext,
  useTrackVolume,
} from "@livekit/components-react";
import { Orb, AgentState as OrbAgentState } from "@/components/ui/orb";
import { Track } from "livekit-client";
import { ConnectionState } from "livekit-client";
import { X, Mic, MicOff, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

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
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Terminal-style Header */}
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
        <span className="text-xs font-mono text-muted-foreground">transcript.log</span>
      </div>

      {/* Messages (Terminal output style) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 font-mono text-sm"
      >
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-center space-y-3"
          >
            <div className="text-muted-foreground/40 text-xs">
              <p>$ waiting for input...</p>
              <p className="mt-2 animate-pulse">_</p>
            </div>
          </motion.div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.speaker}-${index}`}
              className="space-y-1"
            >
              {/* Terminal-style prompt */}
              <div className="flex items-baseline gap-3 text-xs leading-relaxed">
                <span className={`flex-shrink-0 font-semibold min-w-[3rem] ${
                  message.speaker === "user" ? "text-green-400" : "text-blue-400"
                } ${!message.isFinal ? "opacity-50" : ""}`}>
                  {message.speaker === "user" ? "user" : "agent"}
                </span>
                <span className={`flex-1 ${
                  message.isFinal ? "text-foreground/90" : "text-foreground/40 italic"
                }`}>
                  {message.text}
                  {!message.isFinal && <span className="animate-pulse ml-1">...</span>}
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
function DemoControls({ onClose }: { onClose: () => void }) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [sessionEnded, setSessionEnded] = useState(false);

  // Debounced agent state to prevent flickering during speech pauses
  const [debouncedAgentState, setDebouncedAgentState] = useState<string>("idle");
  const stateChangeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSpeakingTimeRef = useRef<number>(0);

  // Audio reactivity for Orb (same as interview page)
  const userVolume = useTrackVolume(audioTrack?.track, 50);
  const agentAudioTrack = room?.remoteParticipants?.[0]?.getTrack(Track.Source.Microphone)?.track;
  const agentVolume = useTrackVolume(agentAudioTrack as any, 50);

  // Normalize volumes from 0-100
  const normalizedUserVolume = Math.min(userVolume, 100) / 100;
  const normalizedAgentVolume = Math.min(agentVolume, 100) / 100;

  // Debounce agent state changes to prevent flickering during natural pauses
  useEffect(() => {
    const currentState = state || "idle";
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
    } else if (currentState !== "speaking" && debouncedAgentState === "speaking") {
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
      segments: any[],
      participant: any,
      publication: any
    ) => {
      segments.forEach((segment: any) => {
        // Show both interim and final transcripts (Option A)
        if (segment.text && segment.text.trim()) {
          // Check participant identity and kind
          const isAgentParticipant =
            participant?.identity?.includes("agent") ||
            participant?.identity?.includes("Agent") ||
            participant?.name?.toLowerCase().includes("agent") ||
            participant?.kind === "agent";

          const speaker = isAgentParticipant ? "agent" : "user";
          const messageId = `${speaker}-${Date.now()}`;

          const newMessage: TranscriptMessage = {
            id: messageId,
            speaker: speaker,
            text: segment.text.trim(),
            timestamp: new Date(),
            isFinal: segment.final,
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
                  Math.abs(msg.timestamp.getTime() - newMessage.timestamp.getTime()) < 1000
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
  }, [room]);

  const toggleMute = () => {
    if (audioTrack && 'setMuted' in audioTrack) {
      const newMutedState = !isMuted;
      (audioTrack as any).setMuted(newMutedState);
      setIsMuted(newMutedState);
    }
  };

  const isConnected = connectionState === ConnectionState.Connected;
  // Use debounced state for UI display to prevent flickering
  const agentState = debouncedAgentState;

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-full w-full flex bg-gradient-to-br from-black via-black to-purple-950/20">
      {/* Main area: Centered content */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-16">
        {/* Timer and Demo Badge (top-right) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute top-12 right-12"
        >
          <div className="flex items-center gap-3">
            {/* 5-Minute Demo Badge */}
            {!isConnected && !sessionEnded && (
              <div className="bg-primary/10 backdrop-blur-xl px-4 py-2 rounded-xl border border-primary/20">
                <span className="text-primary text-xs font-semibold">5-MINUTE DEMO</span>
              </div>
            )}

            {/* Countdown Timer (when connected) */}
            {isConnected && !sessionEnded && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`bg-white/5 backdrop-blur-xl px-5 py-2.5 rounded-xl border ${
                  timeRemaining <= 60 ? "border-red-500/40 bg-red-500/10" : "border-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    timeRemaining <= 60 ? "bg-red-400 animate-pulse" : "bg-primary"
                  }`} />
                  <span className={`text-sm font-mono font-semibold tabular-nums ${
                    timeRemaining <= 60 ? "text-red-200" : "text-white/90"
                  }`}>
                    {formatTime(timeRemaining)}
                  </span>
                  <span className="text-white/50 text-xs">remaining</span>
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
                className="text-center space-y-6"
              >
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold text-white">
                    Demo Complete!
                  </h2>
                  <p className="text-white/60 text-base max-w-lg mx-auto">
                    Thank you for trying Meelni. Ready to practice with a full interview?
                  </p>
                </div>
                <Link
                  href="/setup"
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-background px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
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
                className="w-[400px] h-[400px]"
              >
                <Orb
                  colors={["oklch(0.70 0.22 285)", "oklch(0.55 0.22 285)"]}
                  agentState={
                    agentState === "thinking" ? "thinking" :
                    agentState === "listening" ? "listening" :
                    agentState === "speaking" ? "talking" :
                    null
                  }
                  getInputVolume={() => normalizedUserVolume}
                  getOutputVolume={() => normalizedAgentVolume}
                  className="w-full h-full"
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-3"
              >
                <h2 className="text-2xl font-semibold text-white/90">
                  Connecting...
                </h2>
                <p className="text-white/50 text-sm max-w-md">
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
                <div className="flex items-center gap-3 bg-white/5 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/10">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  <span className="text-white/70 text-sm font-medium">Connecting to Meelni...</span>
                </div>
              ) : agentState === "listening" ? (
                <div className="flex items-center gap-3 bg-blue-500/10 backdrop-blur-xl px-6 py-3 rounded-2xl border border-blue-500/20">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-blue-100 text-sm font-medium">Listening</span>
                </div>
              ) : agentState === "thinking" ? (
                <div className="flex items-center gap-3 bg-purple-500/10 backdrop-blur-xl px-6 py-3 rounded-2xl border border-purple-500/20">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                  <span className="text-purple-100 text-sm font-medium">Thinking</span>
                </div>
              ) : agentState === "speaking" ? (
                <div className="flex items-center gap-3 bg-green-500/10 backdrop-blur-xl px-6 py-3 rounded-2xl border border-green-500/20">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-100 text-sm font-medium">Speaking</span>
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
            className="absolute bottom-12 left-1/2 -translate-x-1/2"
          >
            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-2xl rounded-2xl px-8 py-4 border border-white/10 shadow-2xl">
              {/* Mic button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMute}
                disabled={!isConnected}
                className={`
                  relative p-4 rounded-xl transition-all duration-300 shadow-lg
                  ${
                    isMuted
                      ? "bg-red-500/80 hover:bg-red-500"
                      : "bg-white/10 hover:bg-white/20"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isMuted ? (
                  <MicOff className="h-5 w-5 text-white" />
                ) : (
                  <Mic className="h-5 w-5 text-white" />
                )}
                {!isMuted && isConnected && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                )}
              </motion.button>

              {/* Divider */}
              <div className="w-px h-8 bg-white/10" />

              {/* Close button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 shadow-lg"
              >
                <X className="h-5 w-5 text-white" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Right sidebar: Transcript (terminal-style) */}
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-[400px] border-l border-border/50"
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

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Fetch demo token when modal opens
  useEffect(() => {
    if (isOpen && !token) {
      fetchDemoToken();
    }
  }, [isOpen]);

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
  }, [isOpen]);

  const fetchDemoToken = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/livekit/demo-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: "demo-user-" + Math.random().toString(36).substring(7),
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
  };

  const handleClose = () => {
    // Reset state when closing
    setToken("");
    setUrl("");
    setError("");
    onClose();
  };

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
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
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
            <div className="relative w-full h-full max-w-[1600px] max-h-[900px] rounded-2xl border border-white/10 bg-gradient-to-br from-black via-black to-purple-950/20 shadow-2xl overflow-hidden">
              {/* Keyboard shortcut hint - bottom left */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="absolute bottom-6 left-6 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 backdrop-blur-xl border border-white/10 text-xs text-white/60"
              >
                <kbd className="px-2 py-1 rounded bg-white/10 border border-white/20 font-mono text-white/80">
                  ESC
                </kbd>
                <span>to close</span>
              </motion.div>
              {error ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
                      <X className="h-8 w-8 text-destructive" />
                    </div>
                    <p className="text-destructive font-medium">{error}</p>
                    <button
                      onClick={fetchDemoToken}
                      className="px-8 py-3 rounded-xl bg-primary text-background font-semibold hover:bg-primary/90 transition-all duration-200"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : isLoading || !token ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-white/80 font-medium">
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
                  <DemoControls onClose={handleClose} />
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

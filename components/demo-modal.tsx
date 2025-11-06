"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import Link from "next/link";

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function DemoControls({ onClose }: { onClose: () => void }) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    if (audioTrack) {
      const newMutedState = !isMuted;
      audioTrack.setMuted(newMutedState);
      setIsMuted(newMutedState);
    }
  };

  const isConnected = connectionState === ConnectionState.Connected;
  const agentState = state || "idle";

  return (
    <div className="relative flex flex-col items-center justify-center gap-6 p-8">
      {/* Connection Status */}
      <div className="text-center">
        {!isConnected ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Connecting to Meelni...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-primary">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium">Connected</span>
          </div>
        )}
      </div>

      {/* Audio Visualizer */}
      <div className="relative flex items-center justify-center h-64 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full h-full flex items-center justify-center"
        >
          {isConnected ? (
            <BarVisualizer
              state={agentState}
              barCount={30}
              trackRef={audioTrack}
              className="h-48"
            />
          ) : (
            <div className="h-48 w-full flex items-center justify-center">
              <div className="flex gap-1 items-center">
                {[...Array(30)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-muted rounded-full transition-all"
                    style={{ height: "20%" }}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Agent avatar/icon overlay */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-bold text-background">M</span>
          </div>
        </motion.div>
      </div>

      {/* Agent State Indicator */}
      <div className="text-center min-h-[2rem]">
        {isConnected && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground"
          >
            {agentState === "listening" && "Listening..."}
            {agentState === "thinking" && "Thinking..."}
            {agentState === "speaking" && "Meelni is speaking..."}
            {agentState === "idle" && "Ready to chat"}
          </motion.p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Mic Toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleMute}
          disabled={!isConnected}
          className={`
            relative flex items-center justify-center gap-2 px-6 py-3 rounded-lg
            transition-all duration-200 font-medium
            ${
              isMuted
                ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                : "bg-primary/20 text-primary hover:bg-primary/30"
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span>{isMuted ? "Unmute" : "Microphone On"}</span>

          {/* Active indicator */}
          {!isMuted && isConnected && (
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary animate-pulse" />
          )}
        </motion.button>

        {/* Close Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-background/50 border border-border hover:bg-background/80 transition-all duration-200 font-medium"
        >
          <X className="h-5 w-5" />
          <span>Close</span>
        </motion.button>
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-center mt-4"
      >
        <p className="text-sm text-muted-foreground mb-3">
          Like what you hear? Get the full experience:
        </p>
        <Link
          href="/setup"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-background font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
        >
          Start Full Interview
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Link>
      </motion.div>
    </div>
  );
}

export function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch demo token when modal opens
  useEffect(() => {
    if (isOpen && !token) {
      fetchDemoToken();
    }
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl"
          >
            {/* Close button (top-right) */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-lg p-2 hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Header */}
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-2xl font-semibold">Try Meelni Demo</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Experience a 60-second AI interview demo
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {error ? (
                <div className="text-center py-12">
                  <p className="text-destructive mb-4">{error}</p>
                  <button
                    onClick={fetchDemoToken}
                    className="px-6 py-3 rounded-lg bg-primary text-background font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : isLoading || !token ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Preparing your demo...</p>
                </div>
              ) : (
                <LiveKitRoom
                  token={token}
                  serverUrl={url}
                  connect={true}
                  audio={true}
                  video={false}
                  onDisconnected={handleClose}
                >
                  <DemoControls onClose={handleClose} />
                  <RoomAudioRenderer />
                </LiveKitRoom>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

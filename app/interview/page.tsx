"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
} from "@livekit/components-react";

export default function InterviewPage() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    const role = searchParams.get("role") || "interviewee";
    const mode = searchParams.get("mode") || "mock_interview";
    const interview_type = searchParams.get("interview_type") || "product_sense";
    const voice = searchParams.get("voice") || "";
    const skill_level = searchParams.get("skill_level") || "mid";
    const speed = parseFloat(searchParams.get("speed") || "1.0");
    const emotion = searchParams.get("emotion") || "Neutral";
    const volume = parseFloat(searchParams.get("volume") || "1.0");
    const tts_model = searchParams.get("tts_model") || "sonic-2";
    const stt_model = searchParams.get("stt_model") || "deepgram/nova-2";
    const llm_model = searchParams.get("llm_model") || "openai/gpt-4o-mini";

    setConfig({
      role,
      mode,
      interview_type,
      voice,
      skill_level,
      speed,
      emotion,
      volume,
      tts_model,
      stt_model,
      llm_model,
    });
  }, [searchParams]);

  const connectToRoom = async () => {
    if (!config) return;

    setConnecting(true);
    setSessionEnded(false);
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: "interview-" + Date.now(),
          participantName: "user-" + Math.random().toString(36).substring(7),
          metadata: config,
        }),
      });

      const data = await response.json();
      setToken(data.token);
      setUrl(data.url);
    } catch (error) {
      console.error("Failed to connect:", error);
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setToken("");
    setUrl("");
    setConnecting(false);
    setSessionEnded(true);
  };

  const handleStartNewSession = () => {
    setSessionEnded(false);
    connectToRoom();
  };

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-gray-600">Loading configuration...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="rounded-lg bg-gray-800 p-8 shadow-lg border border-gray-700 max-w-md">
          <h1 className="mb-4 text-2xl font-bold text-white">
            {sessionEnded ? "Session Ended" : "Ready to Start?"}
          </h1>

          {sessionEnded && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg text-green-300 text-sm">
              ✓ Interview session completed successfully
            </div>
          )}
          
          <div className="mb-6 space-y-2 text-sm text-gray-300">
            <div className="flex justify-between">
              <span className="text-gray-400">Role:</span>
              <span className="font-medium">
                {config.role === "interviewee" ? "Interviewee" : "Interviewer"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Type:</span>
              <span className="font-medium">
                {config.interview_type.replace("_", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
              </span>
            </div>
            {config.role === "interviewee" && (
              <div className="flex justify-between">
                <span className="text-gray-400">Mode:</span>
                <span className="font-medium">
                  {config.mode.replace("_", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Speed:</span>
              <span className="font-medium">{config.speed}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">LLM:</span>
              <span className="font-medium text-xs">{config.llm_model}</span>
            </div>
          </div>

          <button
            onClick={sessionEnded ? handleStartNewSession : connectToRoom}
            disabled={connecting}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-white hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 transition-all font-semibold"
          >
            {connecting ? "Connecting..." : sessionEnded ? "Start New Interview" : "Start Interview"}
          </button>

          <div className="mt-4 text-center">
            <a
              href="/setup"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              ← Change Configuration
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleDisconnect}
      className="flex min-h-screen items-center justify-center bg-gray-900"
    >
      <RoomAudioRenderer />
      <InterviewRoom config={config} onEndSession={handleDisconnect} />
    </LiveKitRoom>
  );
}

function InterviewRoom({ config, onEndSession }: { config: any; onEndSession: () => void }) {
  const { state } = useVoiceAssistant();

  const getStatusColor = (state: string) => {
    switch (state) {
      case "listening":
        return "text-green-400";
      case "thinking":
        return "text-yellow-400";
      case "speaking":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusIcon = (state: string) => {
    switch (state) {
      case "listening":
        return "🎤";
      case "thinking":
        return "🤔";
      case "speaking":
        return "💬";
      default:
        return "⏳";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-8">
      <div className="rounded-lg bg-gray-800 p-8 shadow-xl border border-gray-700 min-w-[400px]">
        <h2 className="mb-6 text-xl font-semibold text-white text-center">
          {config.role === "interviewee" ? "Interview Session" : "Conducting Interview"}
        </h2>

        <div className="mb-6 text-center">
          <div className="mb-4 h-32 flex items-center justify-center">
            <div className="text-6xl animate-pulse">{getStatusIcon(state || "connecting")}</div>
          </div>
          <p className="text-sm text-gray-400">
            Status: <span className={"font-medium capitalize " + getStatusColor(state || "connecting")}>{state || "connecting"}</span>
          </p>
        </div>

        <div className="space-y-2 text-sm text-gray-300 border-t border-gray-700 pt-4">
          <div className="flex justify-between">
            <span className="text-gray-500">Interview:</span>
            <span className="font-medium text-xs">
              {config.interview_type.replace("_", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Speed:</span>
            <span className="font-medium">{config.speed}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">LLM:</span>
            <span className="font-medium text-xs">{config.llm_model}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">STT:</span>
            <span className="font-medium text-xs">{config.stt_model}</span>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            {config.role === "interviewee"
              ? "Agent will join and start the interview"
              : "AI candidate is ready for your questions"}
          </p>
        </div>
      </div>

      <div className="max-w-md text-center text-gray-400">
        <p className="text-sm">
          💡 You can interrupt at any time - the agent will stop and listen to you
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onEndSession}
          className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-all text-sm font-medium"
        >
          End Session
        </button>
        <button
          onClick={() => window.location.href = "/setup"}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all text-sm"
        >
          Change Settings
        </button>
      </div>
    </div>
  );
}

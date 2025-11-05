"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  VoiceAssistantControlBar,
} from "@livekit/components-react";
import "@livekit/components-styles";

export default function InterviewPage() {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  const connectToRoom = async () => {
    setConnecting(true);
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: `interview-${Date.now()}`,
          participantName: `user-${Math.random().toString(36).substring(7)}`,
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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-4 text-2xl font-bold">MockMate Interview</h1>
          <p className="mb-6 text-gray-600">
            Ready to practice your PM interview?
          </p>
          <button
            onClick={connectToRoom}
            disabled={connecting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {connecting ? "Connecting..." : "Start Interview"}
          </button>
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
      className="flex min-h-screen items-center justify-center bg-gray-900"
    >
      <InterviewRoom />
    </LiveKitRoom>
  );
}

function InterviewRoom() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-8">
      <RoomAudioRenderer />

      <div className="rounded-lg bg-white p-8 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">Interview Session</h2>

        <div className="mb-6 flex items-center justify-center">
          {audioTrack && (
            <BarVisualizer
              state={state}
              barCount={5}
              trackRef={audioTrack}
              className="h-24 w-64"
            />
          )}
        </div>

        <div className="mb-4 text-center">
          <p className="text-sm text-gray-600">
            Status: <span className="font-medium">{state}</span>
          </p>
        </div>

        <VoiceAssistantControlBar />
      </div>

      <div className="max-w-md text-center text-white">
        <p className="text-sm">
          💡 Tip: Speak clearly and wait for the interviewer to finish before
          responding.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  useLocalParticipant,
  useRemoteParticipants,
  useTrackVolume,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "framer-motion";

export function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const animationFrameRef = useRef<number | undefined>(undefined);

  const userAudioTrack = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  );
  const agentParticipant = remoteParticipants[0];
  const agentAudioTrack = agentParticipant?.getTrackPublication(
    Track.Source.Microphone
  );

  const userVolume = useTrackVolume(userAudioTrack?.track as any);
  const agentVolume = useTrackVolume(agentAudioTrack?.track as any);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barCount = 40;
      const barWidth = width / barCount;
      const padding = 2;

      // Draw user audio (bottom half)
      const userBars = generateBars(barCount, userVolume);
      userBars.forEach((barHeight, i) => {
        const x = i * barWidth + padding;
        const y = height / 2 + (height / 4 - barHeight / 2);
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.8)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.3)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - padding * 2, barHeight);
      });

      // Draw agent audio (top half)
      const agentBars = generateBars(barCount, agentVolume);
      agentBars.forEach((barHeight, i) => {
        const x = i * barWidth + padding;
        const y = height / 4 - barHeight / 2;
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, "rgba(168, 85, 247, 0.8)");
        gradient.addColorStop(1, "rgba(168, 85, 247, 0.3)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - padding * 2, barHeight);
      });

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [userVolume, agentVolume]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-b from-background via-muted/20 to-background rounded-xl overflow-hidden">
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        className="w-full h-full"
      />
      <div className="absolute top-4 left-4 flex flex-col gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span>Agent</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>You</span>
        </div>
      </div>
    </div>
  );
}

function generateBars(count: number, volume: number): number[] {
  const bars: number[] = [];
  const baseHeight = 10;
  const maxHeight = 120;

  for (let i = 0; i < count; i++) {
    // Create a wave effect with some randomness
    const wave = Math.sin(i / count * Math.PI) * 0.5 + 0.5;
    const randomness = Math.random() * 0.3;
    const normalizedVolume = Math.min(volume * 2, 1); // Amplify volume
    const height = baseHeight + (maxHeight - baseHeight) * normalizedVolume * (wave + randomness);
    bars.push(height);
  }

  return bars;
}

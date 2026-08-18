import { useEffect, useMemo, useState } from "react";

export type VoiceVisualizerState =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export interface Coordinate {
  x: number;
  y: number;
}

export function generateConnectingSequence(
  rows: number,
  columns: number,
  radius: number
) {
  const sequence: Coordinate[] = [];
  const centerY = Math.floor(rows / 2);
  const topLeft = {
    x: Math.max(0, centerY - radius),
    y: Math.max(0, centerY - radius),
  };
  const bottomRight = {
    x: columns - 1 - topLeft.x,
    y: Math.min(rows - 1, centerY + radius),
  };

  for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
    sequence.push({ x, y: topLeft.y });
  }
  for (let y = topLeft.y + 1; y <= bottomRight.y; y += 1) {
    sequence.push({ x: bottomRight.x, y });
  }
  for (let x = bottomRight.x - 1; x >= topLeft.x; x -= 1) {
    sequence.push({ x, y: bottomRight.y });
  }
  for (let y = bottomRight.y - 1; y > topLeft.y; y -= 1) {
    sequence.push({ x: topLeft.x, y });
  }

  return sequence;
}

export function generateListeningSequence(rows: number, columns: number) {
  const center = { x: Math.floor(columns / 2), y: Math.floor(rows / 2) };
  const inactive = { x: -1, y: -1 };

  return [center, inactive, inactive, inactive, inactive, inactive, inactive];
}

export function generateThinkingSequence(rows: number, columns: number) {
  const sequence: Coordinate[] = [];
  const y = Math.floor(rows / 2);

  for (let x = 0; x < columns; x += 1) sequence.push({ x, y });
  for (let x = columns - 2; x > 0; x -= 1) sequence.push({ x, y });

  return sequence;
}

export function useAgentAudioVisualizerGridAnimator(
  state: VoiceVisualizerState,
  rows: number,
  columns: number,
  interval: number,
  radius?: number,
  paused = false
): Coordinate {
  const center = useMemo(
    () => ({ x: Math.floor(columns / 2), y: Math.floor(rows / 2) }),
    [columns, rows]
  );
  const [index, setIndex] = useState(0);
  const sequence = useMemo(() => {
    const clampedRadius = radius
      ? Math.min(radius, Math.floor(Math.max(rows, columns) / 2))
      : Math.floor(Math.max(rows, columns) / 2);

    if (paused) {
      return [center];
    }
    if (state === "thinking") {
      return generateThinkingSequence(rows, columns);
    }
    if (state === "connecting") {
      return generateConnectingSequence(rows, columns, clampedRadius);
    }
    if (state === "listening") {
      return generateListeningSequence(rows, columns);
    }
    return [center];
  }, [center, columns, paused, radius, rows, state]);

  useEffect(() => {
    setIndex(0);
  }, [sequence]);

  useEffect(() => {
    if (paused || state === "speaking") return;

    const indexInterval = window.setInterval(() => {
      setIndex((current) => current + 1);
    }, interval);

    return () => window.clearInterval(indexInterval);
  }, [interval, paused, sequence.length, state]);

  return sequence[index % sequence.length] ?? center;
}

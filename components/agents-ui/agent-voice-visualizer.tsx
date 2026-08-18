"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { useInView } from "framer-motion";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";

import {
  AgentAudioVisualizerGrid,
  type VoiceVisualizerState,
} from "@/components/agents-ui/agent-audio-visualizer-grid";
import { cn } from "@/lib/utils";

const DEFAULT_STATUS_LABELS: Record<VoiceVisualizerState, string> = {
  connecting: "Connecting to interviewer",
  listening: "Listening",
  thinking: "Interviewer thinking",
  speaking: "Interviewer speaking",
};

const LANDING_VOICE_MARK_GRID_SIZE = 7;
const LANDING_VOICE_MARK_FRAME_INTERVAL_MS = 100;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const LANDING_VOICE_PATTERN_DURATION_MS = 2_200;
const LANDING_VOICE_PATTERN_FRAME_COUNT =
  LANDING_VOICE_PATTERN_DURATION_MS / LANDING_VOICE_MARK_FRAME_INTERVAL_MS;

export const LANDING_VOICE_PATTERNS = [
  "pacman",
  "listening",
  "snake",
  "orbit",
] as const;

export type LandingVoicePattern = (typeof LANDING_VOICE_PATTERNS)[number];

function createSerpentinePath() {
  return Array.from(
    { length: LANDING_VOICE_MARK_GRID_SIZE ** 2 },
    (_, index) => {
      const row = Math.floor(index / LANDING_VOICE_MARK_GRID_SIZE);
      const offset = index % LANDING_VOICE_MARK_GRID_SIZE;
      const column = row % 2 === 0 ? offset : 6 - offset;

      return row * LANDING_VOICE_MARK_GRID_SIZE + column;
    }
  );
}

function createRingPath(inset: number) {
  const low = inset;
  const high = LANDING_VOICE_MARK_GRID_SIZE - 1 - inset;
  const path: number[] = [];

  for (let column = low; column <= high; column += 1) {
    path.push(low * LANDING_VOICE_MARK_GRID_SIZE + column);
  }
  for (let row = low + 1; row <= high; row += 1) {
    path.push(row * LANDING_VOICE_MARK_GRID_SIZE + high);
  }
  for (let column = high - 1; column >= low; column -= 1) {
    path.push(high * LANDING_VOICE_MARK_GRID_SIZE + column);
  }
  for (let row = high - 1; row > low; row -= 1) {
    path.push(row * LANDING_VOICE_MARK_GRID_SIZE + low);
  }

  return path;
}

const LANDING_SERPENTINE_PATH = createSerpentinePath();
const LANDING_OUTER_RING_PATH = createRingPath(0);
const LANDING_INNER_RING_PATH = createRingPath(1);

function addTrail(
  levels: number[],
  path: number[],
  head: number,
  length: number,
  reverse = false
) {
  for (let offset = 0; offset < length; offset += 1) {
    const direction = reverse ? 1 : -1;
    const pathIndex =
      (head + direction * offset + path.length * 2) % path.length;
    const cell = path[pathIndex];
    const level = Math.max(1, 4 - Math.floor((offset * 4) / length));

    if (cell !== undefined) {
      levels[cell] = Math.max(levels[cell] ?? 0, level);
    }
  }
}

export function createLandingVoicePatternLevels(
  pattern: LandingVoicePattern,
  progress: number
) {
  const wrappedProgress = ((progress % 1) + 1) % 1;
  const levels = Array<number>(LANDING_VOICE_MARK_GRID_SIZE ** 2).fill(0);

  if (pattern === "pacman") {
    const leg = wrappedProgress * 2;
    const movingRight = leg < 1;
    const legProgress = movingRight ? leg : leg - 1;
    const centerColumn = movingRight
      ? -1 + legProgress * 8
      : 7 - legProgress * 8;
    const direction = movingRight ? 1 : -1;
    const mouthOpen =
      0.35 + 0.5 * Math.abs(Math.sin(wrappedProgress * Math.PI * 8));

    for (let row = 0; row < LANDING_VOICE_MARK_GRID_SIZE; row += 1) {
      for (let column = 0; column < LANDING_VOICE_MARK_GRID_SIZE; column += 1) {
        const index = row * LANDING_VOICE_MARK_GRID_SIZE + column;
        const deltaX = column - centerColumn;
        const deltaY = row - 3;
        const radius = Math.hypot(deltaX, deltaY);
        const inFront = deltaX * direction > 0;
        const inMouth =
          inFront && Math.abs(deltaY) <= Math.abs(deltaX) * mouthOpen;
        const pelletAhead =
          row === 3 && (column - centerColumn) * direction > 1.6;

        if (radius <= 1.8 && !inMouth) {
          levels[index] = radius < 0.9 ? 4 : 3;
        } else if (pelletAhead) {
          levels[index] = 2;
        }
      }
    }

    return levels;
  }

  if (pattern === "listening") {
    const ringRadius = wrappedProgress * 4.7;

    for (let row = 0; row < LANDING_VOICE_MARK_GRID_SIZE; row += 1) {
      for (let column = 0; column < LANDING_VOICE_MARK_GRID_SIZE; column += 1) {
        const index = row * LANDING_VOICE_MARK_GRID_SIZE + column;
        const distance = Math.hypot(column - 3, row - 3);
        const ringDistance = Math.abs(distance - ringRadius);

        if (ringDistance < 0.42) levels[index] = 4;
        else if (ringDistance < 0.9) levels[index] = 2;

        if (distance < 0.6) {
          levels[index] = Math.max(
            levels[index] ?? 0,
            2 +
              Math.round(Math.abs(Math.sin(wrappedProgress * Math.PI * 2)) * 2)
          );
        }
      }
    }

    return levels;
  }

  if (pattern === "snake") {
    addTrail(
      levels,
      LANDING_SERPENTINE_PATH,
      Math.floor(wrappedProgress * LANDING_SERPENTINE_PATH.length),
      10
    );
    return levels;
  }

  addTrail(
    levels,
    LANDING_OUTER_RING_PATH,
    Math.floor(wrappedProgress * LANDING_OUTER_RING_PATH.length),
    8
  );
  addTrail(
    levels,
    LANDING_INNER_RING_PATH,
    Math.floor(wrappedProgress * LANDING_INNER_RING_PATH.length),
    6,
    true
  );
  return levels;
}

export function shuffleLandingVoicePatterns(
  random: () => number = Math.random,
  previousLast?: LandingVoicePattern
) {
  const next = [...LANDING_VOICE_PATTERNS];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(
      index,
      Math.floor(Math.max(0, random()) * (index + 1))
    );
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  if (previousLast && next[0] === previousLast) {
    const swapIndex = next.findIndex(
      (pattern, index) => index > 0 && pattern !== previousLast
    );

    if (swapIndex > 0) {
      [next[0], next[swapIndex]] = [next[swapIndex], next[0]];
    }
  }

  return next;
}

function hashSequenceSeed(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createLandingVoicePatternDeck(
  seed: number,
  round: number,
  previousLast?: LandingVoicePattern
) {
  return shuffleLandingVoicePatterns(
    createSeededRandom(seed ^ Math.imul(round + 1, 0x9e3779b1)),
    previousLast
  );
}

function createClientSequenceSeed(fallback: number) {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] ?? fallback;
  }

  return hashSequenceSeed(`${fallback}:${Date.now()}:${Math.random()}`);
}

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getReducedMotionPreference() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches)
  );
}

interface AgentVoiceVisualizerProps {
  state: VoiceVisualizerState;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  volumeBands?: number[];
  cellLevels?: number[];
  activityLevel?: number;
  statusLabel?: string;
  appearance?: "default" | "inverse";
  showStatus?: boolean;
  decorative?: boolean;
  className?: string;
  gridClassName?: string;
}

export function AgentVoiceVisualizer({
  state,
  audioTrack,
  volumeBands,
  cellLevels,
  activityLevel = 0,
  statusLabel,
  appearance = "default",
  showStatus = true,
  decorative = false,
  className,
  gridClassName,
}: AgentVoiceVisualizerProps) {
  const intensity = Math.max(0, Math.min(1, activityLevel));
  const label = statusLabel ?? DEFAULT_STATUS_LABELS[state];

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-5",
        className
      )}
      aria-hidden={decorative || undefined}
    >
      <div
        className="flex min-h-0 flex-1 [transform:scale(var(--voice-activity-scale))] items-center justify-center transition-transform duration-150 motion-reduce:transform-none motion-reduce:transition-none"
        style={
          {
            "--voice-activity-scale": 1 + intensity * 0.04,
          } as CSSProperties
        }
      >
        <AgentAudioVisualizerGrid
          state={state}
          audioTrack={audioTrack}
          volumeBands={volumeBands}
          cellLevels={cellLevels}
          size="xl"
          rowCount={7}
          columnCount={7}
          interval={state === "connecting" ? 90 : 130}
          className={cn(
            "transition-colors duration-200 motion-reduce:transition-none",
            state === "connecting" &&
              (appearance === "inverse"
                ? "text-primary-foreground/50"
                : "text-muted-foreground/60"),
            state === "listening" && "text-info",
            state === "thinking" && "text-primary",
            state === "speaking" && "text-success",
            gridClassName
          )}
        />
      </div>

      {showStatus && !decorative && (
        <div
          className={cn(
            "flex min-h-6 items-center justify-center gap-2 text-sm font-medium",
            appearance === "inverse"
              ? "text-primary-foreground/75"
              : "text-muted-foreground"
          )}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "connecting" && "bg-muted-foreground/50",
              state === "listening" && "bg-info",
              state === "thinking" && "bg-primary",
              state === "speaking" && "bg-success"
            )}
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

export function AgentVoiceVisualizerMark({
  className,
}: {
  className?: string;
}) {
  const markRef = useRef<HTMLDivElement>(null);
  const sequenceId = useId();
  const sequenceSeed = hashSequenceSeed(sequenceId);
  const shouldReduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    () => false
  );
  const isInView = useInView(markRef, { amount: 0.25 });
  const [sequence, setSequence] = useState(() => ({
    seed: sequenceSeed,
    order: createLandingVoicePatternDeck(sequenceSeed, 0),
    patternIndex: 0,
    frame: 0,
    round: 0,
  }));

  useEffect(() => {
    const clientSeed = createClientSequenceSeed(sequenceSeed);
    setSequence((current) => ({ ...current, seed: clientSeed }));
  }, [sequenceSeed]);

  useEffect(() => {
    if (shouldReduceMotion || !isInView) return;

    const frameInterval = window.setInterval(() => {
      setSequence((current) => {
        const nextFrame = current.frame + 1;

        if (nextFrame < LANDING_VOICE_PATTERN_FRAME_COUNT) {
          return { ...current, frame: nextFrame };
        }

        const nextPatternIndex = current.patternIndex + 1;
        if (nextPatternIndex < current.order.length) {
          return {
            ...current,
            patternIndex: nextPatternIndex,
            frame: 0,
          };
        }

        const nextRound = current.round + 1;
        return {
          seed: current.seed,
          order: createLandingVoicePatternDeck(
            current.seed,
            nextRound,
            current.order.at(-1)
          ),
          patternIndex: 0,
          frame: 0,
          round: nextRound,
        };
      });
    }, LANDING_VOICE_MARK_FRAME_INTERVAL_MS);

    return () => window.clearInterval(frameInterval);
  }, [isInView, shouldReduceMotion]);

  const activePattern = shouldReduceMotion
    ? "listening"
    : (sequence.order[sequence.patternIndex] ?? "listening");
  const progress = shouldReduceMotion
    ? 0.35
    : sequence.frame / LANDING_VOICE_PATTERN_FRAME_COUNT;
  const cellLevels = createLandingVoicePatternLevels(activePattern, progress);

  return (
    <div
      ref={markRef}
      className={className}
      data-landing-voice-pattern={activePattern}
      data-landing-voice-pattern-duration-ms={LANDING_VOICE_PATTERN_DURATION_MS}
      aria-hidden="true"
    >
      <AgentVoiceVisualizer
        state="speaking"
        cellLevels={cellLevels}
        showStatus={false}
        decorative
        className="h-full w-full"
      />
    </div>
  );
}

// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentVoiceVisualizerMark,
  LANDING_VOICE_PATTERNS,
  LANDING_VOICE_PATTERN_DURATION_MS,
  createLandingVoicePatternLevels,
  shuffleLandingVoicePatterns,
  type LandingVoicePattern,
} from "./agent-voice-visualizer";

const motionPreference = vi.hoisted(() => ({
  isInView: true,
  shouldReduceMotion: false,
}));

vi.mock("framer-motion", () => ({
  useInView: () => motionPreference.isInView,
}));

vi.mock("@/components/agents-ui/agent-audio-visualizer-grid", () => ({
  AgentAudioVisualizerGrid: ({ cellLevels }: { cellLevels?: number[] }) => (
    <div data-testid="voice-grid" data-cell-levels={cellLevels?.join(",")} />
  ),
}));

function getMark() {
  const mark = screen
    .getByTestId("voice-grid")
    .closest<HTMLElement>("[data-landing-voice-pattern]");

  if (!mark) throw new Error("Landing voice mark was not rendered");
  return mark;
}

describe("AgentVoiceVisualizerMark", () => {
  beforeEach(() => {
    motionPreference.isInView = true;
    motionPreference.shouldReduceMotion = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: motionPreference.shouldReduceMotion,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("moves through the active dot pattern while visible", () => {
    render(<AgentVoiceVisualizerMark />);
    const grid = screen.getByTestId("voice-grid");
    const initialLevels = grid.getAttribute("data-cell-levels");

    act(() => vi.advanceTimersByTime(110));

    expect(grid).not.toHaveAttribute("data-cell-levels", initialLevels);
  });

  it("holds each pattern for exactly 2.20 seconds", () => {
    render(<AgentVoiceVisualizerMark />);
    const mark = getMark();
    const initialPattern = mark.dataset.landingVoicePattern;

    expect(mark).toHaveAttribute(
      "data-landing-voice-pattern-duration-ms",
      "2200"
    );

    act(() => vi.advanceTimersByTime(2_199));
    expect(mark).toHaveAttribute("data-landing-voice-pattern", initialPattern);

    act(() => vi.advanceTimersByTime(1));
    expect(mark).not.toHaveAttribute(
      "data-landing-voice-pattern",
      initialPattern
    );
  });

  it("plays all four patterns before reshuffling without a boundary repeat", () => {
    render(<AgentVoiceVisualizerMark />);
    const mark = getMark();
    const firstRound = [mark.dataset.landingVoicePattern];

    for (let index = 1; index < LANDING_VOICE_PATTERNS.length; index += 1) {
      act(() => vi.advanceTimersByTime(LANDING_VOICE_PATTERN_DURATION_MS));
      firstRound.push(mark.dataset.landingVoicePattern);
    }

    expect(new Set(firstRound)).toEqual(new Set(LANDING_VOICE_PATTERNS));

    const previousLast = firstRound.at(-1);
    act(() => vi.advanceTimersByTime(LANDING_VOICE_PATTERN_DURATION_MS));
    expect(mark.dataset.landingVoicePattern).not.toBe(previousLast);
  });

  it("keeps a stable listening frame when reduced motion is preferred", () => {
    motionPreference.shouldReduceMotion = true;
    render(<AgentVoiceVisualizerMark />);
    const mark = getMark();
    const grid = screen.getByTestId("voice-grid");
    const initialLevels = grid.getAttribute("data-cell-levels");

    expect(mark).toHaveAttribute("data-landing-voice-pattern", "listening");

    act(() => vi.advanceTimersByTime(10_000));

    expect(mark).toHaveAttribute("data-landing-voice-pattern", "listening");
    expect(grid).toHaveAttribute("data-cell-levels", initialLevels);
  });

  it("pauses pattern work while outside the viewport", () => {
    motionPreference.isInView = false;
    render(<AgentVoiceVisualizerMark />);
    const mark = getMark();
    const grid = screen.getByTestId("voice-grid");
    const initialPattern = mark.dataset.landingVoicePattern;
    const initialLevels = grid.getAttribute("data-cell-levels");

    act(() => vi.advanceTimersByTime(10_000));

    expect(mark).toHaveAttribute("data-landing-voice-pattern", initialPattern);
    expect(grid).toHaveAttribute("data-cell-levels", initialLevels);
  });
});

describe("createLandingVoicePatternLevels", () => {
  it("creates four distinct, bounded 7 by 7 patterns", () => {
    const patterns = LANDING_VOICE_PATTERNS.map((pattern) =>
      createLandingVoicePatternLevels(pattern, 0.35)
    );

    for (const levels of patterns) {
      expect(levels).toHaveLength(49);
      expect(levels.every((level) => Number.isInteger(level))).toBe(true);
      expect(levels.every((level) => level >= 0 && level <= 4)).toBe(true);
      expect(levels.some((level) => level === 4)).toBe(true);
    }

    expect(new Set(patterns.map((levels) => levels.join(",")))).toHaveLength(4);
  });

  it.each(LANDING_VOICE_PATTERNS)("animates the %s pattern", (pattern) => {
    expect(createLandingVoicePatternLevels(pattern, 0.2)).not.toEqual(
      createLandingVoicePatternLevels(pattern, 0.4)
    );
  });
});

describe("shuffleLandingVoicePatterns", () => {
  it("returns every pattern exactly once", () => {
    const deck = shuffleLandingVoicePatterns(() => 0.42);

    expect(new Set(deck)).toEqual(new Set(LANDING_VOICE_PATTERNS));
    expect(deck).toHaveLength(LANDING_VOICE_PATTERNS.length);
  });

  it.each(LANDING_VOICE_PATTERNS)(
    "avoids repeating %s across a round boundary",
    (previousLast: LandingVoicePattern) => {
      const deck = shuffleLandingVoicePatterns(() => 0, previousLast);

      expect(deck[0]).not.toBe(previousLast);
      expect(new Set(deck)).toEqual(new Set(LANDING_VOICE_PATTERNS));
    }
  );
});

it("uses the approved fixed pattern duration", () => {
  expect(LANDING_VOICE_PATTERN_DURATION_MS).toBe(2_200);
});

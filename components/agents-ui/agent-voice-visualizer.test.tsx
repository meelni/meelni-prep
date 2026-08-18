// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentVoiceVisualizerMark,
  createLandingVoiceMarkBands,
} from "./agent-voice-visualizer";

const motionPreference = vi.hoisted(() => ({
  isInView: true,
  shouldReduceMotion: false,
}));

vi.mock("framer-motion", () => ({
  useInView: () => motionPreference.isInView,
  useReducedMotion: () => motionPreference.shouldReduceMotion,
}));

vi.mock("@/components/agents-ui/agent-audio-visualizer-grid", () => ({
  AgentAudioVisualizerGrid: ({ volumeBands }: { volumeBands?: number[] }) => (
    <div data-testid="voice-grid" data-volume-bands={volumeBands?.join(",")} />
  ),
}));

describe("AgentVoiceVisualizerMark", () => {
  beforeEach(() => {
    motionPreference.isInView = true;
    motionPreference.shouldReduceMotion = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("moves through the voice cycle while visible", () => {
    render(<AgentVoiceVisualizerMark />);
    const grid = screen.getByTestId("voice-grid");
    const initialBands = grid.getAttribute("data-volume-bands");

    act(() => vi.advanceTimersByTime(110));

    expect(grid).not.toHaveAttribute("data-volume-bands", initialBands);
  });

  it("keeps a stable frame when reduced motion is preferred", () => {
    motionPreference.shouldReduceMotion = true;
    render(<AgentVoiceVisualizerMark />);
    const grid = screen.getByTestId("voice-grid");
    const initialBands = grid.getAttribute("data-volume-bands");

    act(() => vi.advanceTimersByTime(1_000));

    expect(grid).toHaveAttribute("data-volume-bands", initialBands);
  });

  it("pauses synthetic audio work while outside the viewport", () => {
    motionPreference.isInView = false;
    render(<AgentVoiceVisualizerMark />);
    const grid = screen.getByTestId("voice-grid");
    const initialBands = grid.getAttribute("data-volume-bands");

    act(() => vi.advanceTimersByTime(1_000));

    expect(grid).toHaveAttribute("data-volume-bands", initialBands);
  });
});

describe("createLandingVoiceMarkBands", () => {
  it("keeps the voice mark centered and symmetric throughout the loop", () => {
    for (const progress of [0, 0.125, 0.25, 0.5, 0.75]) {
      const bands = createLandingVoiceMarkBands(progress);

      expect(bands).toHaveLength(7);
      expect(bands[0]).toBeCloseTo(bands[6] ?? 0);
      expect(bands[1]).toBeCloseTo(bands[5] ?? 0);
      expect(bands[2]).toBeCloseTo(bands[4] ?? 0);
      expect(bands.every((band) => band >= 0.2 && band <= 0.95)).toBe(true);
    }
  });

  it("changes gradually between neighboring animation samples", () => {
    const samples = Array.from({ length: 33 }, (_, index) =>
      createLandingVoiceMarkBands(index / 32)
    );

    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
      const current = samples[sampleIndex] ?? [];
      const previous = samples[sampleIndex - 1] ?? [];
      const largestChange = Math.max(
        ...current.map((band, bandIndex) =>
          Math.abs(band - (previous[bandIndex] ?? band))
        )
      );

      expect(largestChange).toBeLessThan(0.05);
    }
  });

  it("returns to the same shape at the loop boundary", () => {
    const start = createLandingVoiceMarkBands(0);
    const end = createLandingVoiceMarkBands(1);

    expect(end).toEqual(start);
  });
});

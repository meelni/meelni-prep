// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentVoiceVisualizerMark } from "./agent-voice-visualizer";

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

  it("cycles through speaking-band frames while visible", () => {
    render(<AgentVoiceVisualizerMark />);
    const grid = screen.getByTestId("voice-grid");
    const initialBands = grid.getAttribute("data-volume-bands");

    act(() => vi.advanceTimersByTime(250));

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

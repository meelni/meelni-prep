// @vitest-environment jsdom

import React, { useRef, useState } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoModal } from "./demo-modal";
import { Hero } from "./sections/hero";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  RoomAudioRenderer: () => null,
  useConnectionState: () => "connected",
  useLocalParticipant: () => ({ localParticipant: null }),
  useRoomContext: () => ({ on: vi.fn(), off: vi.fn() }),
  useTrackVolume: () => 0,
  useVoiceAssistant: () => ({ agent: null, audioTrack: null, state: "idle" }),
}));

vi.mock("livekit-client", () => ({
  ConnectionState: { Connected: "connected" },
  Track: { Source: { Microphone: "microphone" } },
}));

vi.mock("@/components/ui/orb", () => ({ Orb: () => <div /> }));
vi.mock("@/components/ui/animated-bars", () => ({
  AnimatedBars: () => <div aria-hidden="true" />,
}));
vi.mock("@/components/ui/checkered-background", () => ({
  default: () => <div aria-hidden="true" />,
}));
vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: vi.fn() },
}));

function DemoHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Try voice demo
      </button>
      <DemoModal
        isOpen={open}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe("DemoModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is a named modal dialog that traps focus and restores the hero trigger", async () => {
    const user = userEvent.setup();
    render(<DemoHarness />);

    const trigger = screen.getByRole("button", { name: "Try voice demo" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Meelni voice demo",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to Meelni..."
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("restores focus to the production hero voice-demo trigger", async () => {
    const user = userEvent.setup();
    render(<Hero />);

    const primaryLink = screen.getByRole("link", {
      name: "Start a mock interview",
    });
    const demoTrigger = screen.getByRole("button", {
      name: "Try voice demo",
    });

    await user.click(demoTrigger);
    expect(
      await screen.findByRole("dialog", { name: "Meelni voice demo" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(demoTrigger).toHaveFocus();
    expect(primaryLink).not.toHaveFocus();
  });
});

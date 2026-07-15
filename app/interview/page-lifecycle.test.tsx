// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const mocks = vi.hoisted(() => ({
  authUser: { id: "owner-a" } as { id: string } | null,
  bindOwner: vi.fn(),
  clearQueue: vi.fn(),
  clearSession: vi.fn(),
  flush: vi.fn(),
  invalidateQueries: vi.fn(),
  livekitMounted: vi.fn(),
  livekitUnmounted: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () =>
    new URLSearchParams("roundType=product_sense&mode=voice_video"),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.authUser, isLoading: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/lib/utils/transcript-queue", () => ({
  getTranscriptQueue: () => ({
    bindOwner: mocks.bindOwner,
    clear: mocks.clearQueue,
    clearSession: mocks.clearSession,
    flush: mocks.flush,
    save: mocks.save,
  }),
}));

vi.mock("@/components/interview/livekit-room", async () => {
  const ReactModule = await import("react");
  return {
    LiveKitRoomWrapper: ({
      children,
      onConnectionStateChange,
    }: {
      children: React.ReactNode;
      onConnectionStateChange(status: "connected"): void;
    }) => {
      ReactModule.useEffect(() => {
        mocks.livekitMounted();
        onConnectionStateChange("connected");
        return () => mocks.livekitUnmounted();
      }, [onConnectionStateChange]);
      return <div data-testid="livekit-room">{children}</div>;
    },
  };
});

vi.mock("@livekit/components-react", () => ({
  RoomAudioRenderer: () => null,
  useLocalParticipant: () => ({ localParticipant: null }),
}));

vi.mock("@/lib/analytics/use-web-vitals", () => ({
  useWebVitals: () => undefined,
}));

vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: vi.fn() },
}));

vi.mock("@/components/interview/nudge-overlay", () => ({
  NudgeOverlay: () => null,
}));

vi.mock("./components/audio-visualizer", () => ({
  AudioVisualizer: () => null,
}));

vi.mock("./components/connection-indicator", () => ({
  ConnectionIndicator: () => null,
}));

vi.mock("./components/timer-display", () => ({
  TimerDisplay: () => null,
}));

vi.mock("./components/transcript-panel", () => ({
  TranscriptPanel: () => null,
}));

vi.mock("./components/interview-controls", () => ({
  InterviewControls: ({ onEndSession }: { onEndSession(): void }) => (
    <button type="button" onClick={onEndSession}>
      Open end confirmation
    </button>
  ),
}));

vi.mock("./components/end-session-modal", () => ({
  EndSessionModal: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm(): void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onConfirm}>
        Confirm end
      </button>
    ) : null,
}));

import { InterviewPageContent } from "./page";

describe("active interview page lifecycle", () => {
  beforeEach(() => {
    mocks.authUser = { id: "owner-a" };
    mocks.flush.mockResolvedValue({ settled: true, pending: 0, failed: 0 });
    mocks.save.mockResolvedValue({ success: true });
    vi.stubGlobal("fetch", vi.fn(createSessionResponse));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("unmounts owner A's active room and purges its state on direct owner replacement", async () => {
    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();

    mocks.authUser = { id: "owner-b" };
    view.rerender(<InterviewPageContent />);

    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.bindOwner).toHaveBeenCalledWith("owner-b")
    );
    expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("unmounts the active room and closes the queue when the owner signs out", async () => {
    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();

    mocks.authUser = null;
    view.rerender(<InterviewPageContent />);

    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.clearQueue).toHaveBeenCalledTimes(1));
    expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/auth/signin?redirectTo=/interview"
    );
  });

  it("disconnects and freezes the room after an ambiguous end transport failure", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/session/start") return createSessionResponse();
      if (url === "/api/interview/end") {
        throw new TypeError("connection reset after request write");
      }
      if (url === `/api/session/${SESSION_ID}`) {
        return Response.json({
          session: { lifecycleState: "active", feedbackReady: false },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    expect(await screen.findByRole("status", { name: "" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(
      screen.getByRole("heading", { name: "Confirming interview completion" })
    ).toBeInTheDocument();
    expect(screen.getByText(/interview cannot resume/i)).toBeInTheDocument();
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1);
  });
});

function createSessionResponse() {
  return Response.json({
    sessionId: SESSION_ID,
    token: "short-lived-token",
    url: "wss://preview.livekit.cloud",
    roomName: "interview-room",
    deadlineAt: "2099-07-15T22:00:00.000Z",
    config: { difficulty: "intermediate" },
    question: null,
  });
}

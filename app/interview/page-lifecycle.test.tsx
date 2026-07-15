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
  flush: vi.fn(),
  invalidateQueries: vi.fn(),
  livekitMounted: vi.fn(),
  livekitUnmounted: vi.fn(),
  onTranscriptUpdate: null as
    | null
    | ((turn: Record<string, unknown>) => Promise<void> | void),
  push: vi.fn(),
  replace: vi.fn(),
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

vi.mock("@/components/interview/livekit-room", async () => {
  const ReactModule = await import("react");
  return {
    LiveKitRoomWrapper: ({
      children,
      onConnectionStateChange,
      onTranscriptFlushAvailable,
      onTranscriptUpdate,
    }: {
      children: React.ReactNode;
      onConnectionStateChange(status: "connected"): void;
      onTranscriptFlushAvailable(flush: typeof mocks.flush | null): void;
      onTranscriptUpdate(turn: Record<string, unknown>): Promise<void> | void;
    }) => {
      ReactModule.useEffect(() => {
        mocks.livekitMounted();
        return () => mocks.livekitUnmounted();
      }, []);
      ReactModule.useEffect(() => {
        mocks.onTranscriptUpdate = onTranscriptUpdate;
        onTranscriptFlushAvailable(mocks.flush);
        return () => {
          mocks.onTranscriptUpdate = null;
          onTranscriptFlushAvailable(null);
        };
      }, [onTranscriptFlushAvailable, onTranscriptUpdate]);
      ReactModule.useEffect(() => {
        onConnectionStateChange("connected");
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
    mocks.onTranscriptUpdate = null;
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
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
    );
    expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1);
  });

  it("unmounts the active room when the owner signs out", async () => {
    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();

    mocks.authUser = null;
    view.rerender(<InterviewPageContent />);

    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/auth/signin?redirectTo=/interview"
      )
    );
    expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1);
  });

  it("renders runtime transcript notifications without a browser write", async () => {
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/session/start") return createSessionResponse();
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          return Response.json({ turns: [] });
        }
        throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(mocks.onTranscriptUpdate).not.toBeNull();

    await mocks.onTranscriptUpdate?.({
      persistable: true,
      eventId: "event-1",
      sessionId: SESSION_ID,
      speaker: "interviewer",
      text: "Synthetic fixture",
      timestamp: new Date("2099-07-15T21:00:00.000Z"),
      event: {
        version: 2,
        eventId: "event-1",
        writerId: "writer-1",
        sequence: 1,
        sessionId: SESSION_ID,
        roomName: "interview-room",
        speaker: "interviewer",
        text: "Synthetic fixture",
        startedAt: "2099-07-15T21:00:00.000Z",
        endedAt: "2099-07-15T21:00:01.000Z",
        audioMs: 1000,
        deliveryState: "delivered",
      },
    });

    expect(
      request.mock.calls.some(
        ([input, init]) =>
          String(input).includes("transcript") && init?.method === "POST"
      )
    ).toBe(false);
  });

  it("disconnects and freezes the room after an ambiguous end transport failure", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/session/start") return createSessionResponse();
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        return Response.json({ turns: [] });
      }
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

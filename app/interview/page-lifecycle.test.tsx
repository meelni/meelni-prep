// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
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
  invalidateQueries: vi.fn(),
  livekitMounted: vi.fn(),
  livekitUnmounted: vi.fn(),
  onAgentStateChange: null as null | ((state: string) => void),
  onTranscriptUpdate: null as
    | null
    | ((turn: Record<string, unknown>) => Promise<void> | void),
  transcriptTurns: [] as Array<Record<string, unknown>>,
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(`sessionId=${SESSION_ID}`),
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
      onAgentStateChange,
      onConnectionStateChange,
      onTranscriptUpdate,
    }: {
      children: React.ReactNode;
      onAgentStateChange(state: string): void;
      onConnectionStateChange(status: "connected"): void;
      onTranscriptUpdate(turn: Record<string, unknown>): Promise<void> | void;
    }) => {
      ReactModule.useEffect(() => {
        mocks.livekitMounted();
        return () => mocks.livekitUnmounted();
      }, []);
      ReactModule.useEffect(() => {
        mocks.onTranscriptUpdate = onTranscriptUpdate;
        mocks.onAgentStateChange = onAgentStateChange;
        return () => {
          mocks.onTranscriptUpdate = null;
          mocks.onAgentStateChange = null;
        };
      }, [onAgentStateChange, onTranscriptUpdate]);
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
  TranscriptPanel: ({ turns }: { turns: Array<Record<string, unknown>> }) => {
    mocks.transcriptTurns = turns;
    return null;
  },
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
    error,
    isOpen,
    onConfirm,
  }: {
    error?: string | null;
    isOpen: boolean;
    onConfirm(): void;
  }) =>
    isOpen ? (
      <>
        {error && <div role="alert">{error}</div>}
        <button type="button" onClick={onConfirm}>
          Confirm end
        </button>
      </>
    ) : null,
}));

import { storeInitialInterviewRoomCredentials } from "@/lib/interview/room-credential-handoff";
import { FeedbackReview } from "@/components/feedback/feedback-review";
import { InterviewPageContent } from "./page";

describe("active interview page lifecycle", () => {
  beforeEach(() => {
    mocks.authUser = { id: "owner-a" };
    mocks.onAgentStateChange = null;
    mocks.onTranscriptUpdate = null;
    mocks.transcriptTurns = [];
    vi.stubGlobal("fetch", vi.fn(activeInterviewResponse));
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
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          return Response.json({
            turns: [
              {
                id: "f47ac10b-58cc-4372-a567-0e02b2c3d480",
                eventId: "event-2",
                writerId: "writer-a",
                writerGeneration: 2,
                sequence: 1,
                sessionId: SESSION_ID,
                roomName: "interview-room",
                speaker: "interviewer",
                text: "Durable generation two",
                startedAt: "2099-07-15T21:00:00.000Z",
                endedAt: "2099-07-15T21:00:01.000Z",
                audioMs: 1000,
                section: "product_sense",
                deliveryState: "delivered",
              },
            ],
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onTranscriptUpdate).not.toBeNull());

    await mocks.onTranscriptUpdate?.({
      persistable: true,
      eventId: "event-1",
      rowId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      writerId: "writer-z",
      writerGeneration: 1,
      sequence: 1,
      sessionId: SESSION_ID,
      speaker: "interviewer",
      text: "Synthetic fixture",
      timestamp: new Date("2099-07-15T21:00:00.000Z"),
      startedAt: new Date("2099-07-15T21:00:00.000Z"),
      event: {
        contract_version: 2,
        event_id: "event-1",
        writer_id: "writer-z",
        writer_generation: 1,
        sequence: 1,
        session_id: SESSION_ID,
        room_name: "interview-room",
        speaker: "interviewer",
        text: "Synthetic fixture",
        is_final: true,
        started_at: "2099-07-15T21:00:00.000Z",
        ended_at: "2099-07-15T21:00:01.000Z",
        audio_duration_ms: 1000,
        section: "product_sense",
        delivery_state: "delivered",
      },
    });

    await waitFor(() =>
      expect(mocks.transcriptTurns.map((turn) => turn.text)).toEqual([
        "Synthetic fixture",
        "Durable generation two",
      ])
    );
    expect(mocks.transcriptTurns).toEqual([
      expect.objectContaining({
        rowId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        writerGeneration: 1,
      }),
      expect.objectContaining({
        rowId: "f47ac10b-58cc-4372-a567-0e02b2c3d480",
        writerGeneration: 2,
      }),
    ]);

    expect(
      request.mock.calls.some(
        ([input, init]) =>
          String(input).includes("transcript") && init?.method === "POST"
      )
    ).toBe(false);
  });

  it("rehydrates durable turns after an agent-state transition when room data is missed", async () => {
    let durableTurnAvailable = false;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        return Response.json({
          turns: durableTurnAvailable
            ? [
                {
                  id: "f47ac10b-58cc-4372-a567-0e02b2c3d481",
                  eventId: "event-recovered",
                  writerId: "writer-a",
                  writerGeneration: 1,
                  sequence: 2,
                  sessionId: SESSION_ID,
                  roomName: "interview-room",
                  speaker: "user",
                  text: "Recovered durable turn",
                  startedAt: "2099-07-15T21:00:02.000Z",
                  endedAt: "2099-07-15T21:00:03.000Z",
                  audioMs: 1000,
                  section: "product_sense",
                  deliveryState: "delivered",
                },
              ]
            : [],
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([input]) => String(input) === `/api/session/${SESSION_ID}/transcript`
        )
      ).toBe(true)
    );
    await waitFor(() => expect(mocks.onAgentStateChange).not.toBeNull());

    durableTurnAvailable = true;
    act(() => mocks.onAgentStateChange?.("thinking"));

    await waitFor(() =>
      expect(mocks.transcriptTurns).toEqual([
        expect.objectContaining({
          eventId: "event-recovered",
          text: "Recovered durable turn",
        }),
      ])
    );
  });

  it("keeps full mock hints off for legacy gentle session metadata", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}`) {
        return Response.json({
          session: {
            id: SESSION_ID,
            livekitRoomName: "interview-room",
            startedAt: "2099-07-15T21:00:00.000Z",
            deadlineAt: "2099-07-15T22:00:00.000Z",
            lifecycleState: "active",
            lifecycleVersion: 3,
            endedAt: null,
            reconnectDeadlineAt: null,
            feedbackReady: false,
            roundType: "product_sense",
            mode: "voice_video",
            config: { difficulty: "intermediate", hintMode: "gentle" },
          },
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onTranscriptUpdate).not.toBeNull());

    await mocks.onTranscriptUpdate?.({
      persistable: true,
      eventId: "event-user-1",
      sessionId: SESSION_ID,
      speaker: "user",
      text: "Synthetic answer without customer content.",
      timestamp: new Date("2099-07-15T21:00:01.000Z"),
    });

    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/nudges/analyze"
      )
    ).toBe(false);
  });

  it("uses the successful start token without making a second token request", async () => {
    const request = vi.fn(activeInterviewResponse);
    vi.stubGlobal("fetch", request);
    storeInitialInterviewRoomCredentials({
      response: {
        sessionId: SESSION_ID,
        token: "initial-start-token",
        url: "wss://preview.livekit.cloud",
        roomName: "interview-room",
      },
      sessionId: SESSION_ID,
      ownerId: "owner-a",
    });

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/livekit/token"
      )
    ).toBe(false);
  });

  it("shows an actionable failure instead of spinning forever when initial authorization is rejected", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/livekit/token") {
        return Response.json(
          {
            error: "session_not_joinable",
            message: "This interview session is no longer active.",
          },
          { status: 409 }
        );
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(
      await screen.findByRole("heading", { name: "Failed to Load Interview" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Connecting to room...")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to Dashboard" })
    ).toBeVisible();
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
  });

  it("disconnects and freezes the room after an ambiguous end transport failure", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        return Response.json({ turns: [] });
      }
      if (url === "/api/interview/end") {
        throw new TypeError("connection reset after request write");
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    const completionHeading = await screen.findByRole("heading", {
      name: "Confirming interview completion",
    });
    expect(completionHeading.closest('[role="status"]')).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByText(/interview cannot resume/i)).toBeInTheDocument();
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.livekitUnmounted).toHaveBeenCalledTimes(1)
    );
  });

  it("leaves reconciliation for feedback once terminal truth commits even while feedback is pending", async () => {
    let endRequested = false;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interview/end") {
        endRequested = true;
        throw new TypeError("connection reset after request write");
      }
      if (url === `/api/session/${SESSION_ID}` && endRequested) {
        return Response.json({
          session: {
            lifecycleState: "completed",
            feedbackReady: false,
          },
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
  });

  it("hands a committed ambiguous end to the feedback page while generation is pending", async () => {
    let endRequested = false;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interview/end") {
        endRequested = true;
        throw new TypeError("connection reset after committed end");
      }
      if (url === `/api/session/${SESSION_ID}` && endRequested) {
        return Response.json({
          session: {
            lifecycleState: "completed",
            feedbackReady: false,
          },
        });
      }
      if (url === `/api/feedback/${SESSION_ID}`) {
        return Response.json({ status: "pending", retryable: false });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    const interview = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
    interview.unmount();
    render(<FeedbackReview sessionId={SESSION_ID} />);

    expect(
      await screen.findByRole("heading", { name: "Feedback queued" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading feedback")).not.toBeInTheDocument();
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === `/api/feedback/${SESSION_ID}`
      )
    ).toBe(true);
  });

  it("keeps the interview frozen and offers the same End command after a definitive server failure", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/interview/end") {
        return Response.json(
          {
            error: "session_end_failed",
            message:
              "Your interview is paused, but we couldn't confirm completion yet. Please try End Interview again.",
          },
          { status: 500 }
        );
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((alert) => /Needs recovery/i.test(alert.textContent ?? ""))
    ).toBe(true);
    expect(
      alerts.some((alert) =>
        /try End Interview again/i.test(alert.textContent ?? "")
      )
    ).toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/api/interview/end",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/interview/runtime-settlement"
      )
    ).toBe(false);
  });

  it("navigates immediately after the server accepts background finalization", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interview/end") {
        return Response.json(
          {
            status: "settling",
            nextHref: `/feedback/${SESSION_ID}/loading`,
          },
          { status: 202 }
        );
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open end confirmation" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/interview/end",
        expect.objectContaining({
          method: "POST",
          signal: expect.any(AbortSignal),
        })
      )
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/feedback/${SESSION_ID}/loading`)
    );
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/interview/runtime-settlement"
      )
    ).toBe(false);
  });
});

function activeInterviewResponse(
  input: RequestInfo | URL,
  _init?: RequestInit
) {
  const url = String(input);
  if (url === `/api/session/${SESSION_ID}`) {
    return Response.json({
      session: {
        id: SESSION_ID,
        livekitRoomName: "interview-room",
        startedAt: "2099-07-15T21:00:00.000Z",
        deadlineAt: "2099-07-15T22:00:00.000Z",
        lifecycleState: "active",
        lifecycleVersion: 3,
        endedAt: null,
        reconnectDeadlineAt: null,
        feedbackReady: false,
        roundType: "product_sense",
        mode: "voice_video",
        config: { difficulty: "intermediate" },
      },
    });
  }
  if (url === "/api/livekit/token") {
    return Response.json({
      token: "short-lived-token",
      url: "wss://preview.livekit.cloud",
      roomName: "interview-room",
      authorizationVersion: 3,
      expiresAt: "2099-07-15T21:05:00.000Z",
    });
  }
  if (url === `/api/session/${SESSION_ID}/transcript`) {
    return Response.json({ turns: [] });
  }
  throw new Error(`Unexpected request: ${url}`);
}

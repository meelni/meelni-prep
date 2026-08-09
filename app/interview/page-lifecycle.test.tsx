// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  authUser: { id: "owner-a" } as { id: string } | null,
  invalidateQueries: vi.fn(),
  livekitMounted: vi.fn(),
  livekitUnmounted: vi.fn(),
  microphoneEnabled: false,
  setMicrophoneEnabled: vi.fn(),
  analyticsTrack: vi.fn(),
  onAgentStateChange: null as null | ((state: string) => void),
  onConnectionStateChange: null as
    | null
    | ((
        state:
          | "connecting"
          | "transport_delayed"
          | "connected"
          | "delayed"
          | "syncing"
          | "reconnecting"
          | "recovered"
          | "disconnected"
      ) => void),
  onDeadlineReached: null as null | (() => void),
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

vi.mock("@tanstack/react-query", () => {
  const queryClient = { invalidateQueries: mocks.invalidateQueries };
  return { useQueryClient: () => queryClient };
});

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
      onConnectionStateChange(
        status:
          | "connecting"
          | "transport_delayed"
          | "connected"
          | "delayed"
          | "syncing"
          | "reconnecting"
          | "recovered"
          | "disconnected"
      ): void;
      onTranscriptUpdate(turn: Record<string, unknown>): Promise<void> | void;
    }) => {
      const connectedReported = ReactModule.useRef(false);
      ReactModule.useEffect(() => {
        mocks.livekitMounted();
        return () => mocks.livekitUnmounted();
      }, []);
      ReactModule.useEffect(() => {
        mocks.onTranscriptUpdate = onTranscriptUpdate;
        mocks.onAgentStateChange = onAgentStateChange;
        mocks.onConnectionStateChange = onConnectionStateChange;
        return () => {
          mocks.onTranscriptUpdate = null;
          mocks.onAgentStateChange = null;
          mocks.onConnectionStateChange = null;
        };
      }, [onAgentStateChange, onConnectionStateChange, onTranscriptUpdate]);
      ReactModule.useEffect(() => {
        if (!connectedReported.current) {
          connectedReported.current = true;
          onConnectionStateChange("connected");
        }
      }, [onConnectionStateChange]);
      return <div data-testid="livekit-room">{children}</div>;
    },
  };
});

vi.mock("@livekit/components-react", () => ({
  RoomAudioRenderer: () => null,
  useLocalParticipant: (() => {
    const localParticipant = {
      get isMicrophoneEnabled() {
        return mocks.microphoneEnabled;
      },
      setMicrophoneEnabled: (enabled: boolean) =>
        mocks.setMicrophoneEnabled(enabled),
    };
    return () => ({
      localParticipant,
      isMicrophoneEnabled: mocks.microphoneEnabled,
      lastMicrophoneError: undefined,
    });
  })(),
}));

vi.mock("@/lib/analytics/use-web-vitals", () => ({
  useWebVitals: () => undefined,
}));

vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: mocks.analyticsTrack },
}));

vi.mock("./components/audio-visualizer", () => ({
  AudioVisualizer: () => null,
}));

vi.mock("./components/connection-indicator", () => ({
  ConnectionIndicator: () => null,
}));

vi.mock("./components/timer-display", () => ({
  TimerDisplay: ({ onDeadlineReached }: { onDeadlineReached(): void }) => {
    mocks.onDeadlineReached = onDeadlineReached;
    return null;
  },
}));

vi.mock("./components/transcript-panel", () => ({
  TranscriptPanel: ({ turns }: { turns: Array<Record<string, unknown>> }) => {
    mocks.transcriptTurns = turns;
    return null;
  },
}));

vi.mock("./components/interview-controls", () => ({
  InterviewControls: ({
    muteDisabled,
    onToggleMute,
    onEndSession,
  }: {
    muteDisabled?: boolean;
    onToggleMute(): void;
    onEndSession(): void;
  }) => (
    <>
      <button type="button" disabled={muteDisabled} onClick={onToggleMute}>
        Microphone controls
      </button>
      <button type="button" onClick={onEndSession}>
        Open end confirmation
      </button>
    </>
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
import { CUSTOMER_CLIENT_FETCH_DEADLINE_MS } from "@/lib/http/deadline";
import {
  TERMINAL_POLL_MAX_ATTEMPTS,
  TERMINAL_POLL_WINDOW_MS,
} from "@/lib/interview/terminal-poll-window";
import { InterviewPageContent } from "./page";

describe("active interview page lifecycle", () => {
  beforeEach(() => {
    mocks.authUser = { id: "owner-a" };
    mocks.onAgentStateChange = null;
    mocks.onConnectionStateChange = null;
    mocks.onDeadlineReached = null;
    mocks.onTranscriptUpdate = null;
    mocks.transcriptTurns = [];
    mocks.microphoneEnabled = false;
    mocks.analyticsTrack.mockReset();
    mocks.setMicrophoneEnabled.mockImplementation(async (enabled: boolean) => {
      mocks.microphoneEnabled = enabled;
      return enabled ? {} : undefined;
    });
    vi.stubGlobal("fetch", vi.fn(activeInterviewResponse));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  it("recovers a transient transcript read while preserving a runtime packet received during retry", async () => {
    let transcriptReads = 0;
    let resolveHydration: ((response: Response) => void) | undefined;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          if (transcriptReads === 1) {
            return Response.json(
              { error: "transcript_read_unavailable" },
              { status: 503 }
            );
          }
          return new Promise<Response>((resolve) => {
            resolveHydration = resolve;
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(transcriptReads).toBe(1));
    await waitFor(() => expect(mocks.onTranscriptUpdate).not.toBeNull());
    await waitFor(() => expect(transcriptReads).toBe(2), { timeout: 2_000 });

    await mocks.onTranscriptUpdate?.({
      persistable: true,
      eventId: "event-runtime-during-retry",
      rowId: "f47ac10b-58cc-4372-a567-0e02b2c3d483",
      writerId: "writer-a",
      writerGeneration: 1,
      sequence: 2,
      sessionId: SESSION_ID,
      speaker: "user",
      text: "Runtime turn during retry",
      timestamp: new Date("2099-07-15T21:00:02.000Z"),
      startedAt: new Date("2099-07-15T21:00:02.000Z"),
      event: {
        contract_version: 2,
        event_id: "event-runtime-during-retry",
        writer_id: "writer-a",
        writer_generation: 1,
        sequence: 2,
        session_id: SESSION_ID,
        room_name: "interview-room",
        speaker: "user",
        text: "Runtime turn during retry",
        is_final: true,
        started_at: "2099-07-15T21:00:02.000Z",
        ended_at: "2099-07-15T21:00:03.000Z",
        audio_duration_ms: 1000,
        section: "product_sense",
        delivery_state: "delivered",
      },
    });

    await waitFor(() =>
      expect(mocks.transcriptTurns.map((turn) => turn.text)).toEqual([
        "Runtime turn during retry",
      ])
    );
    expect(resolveHydration).toBeDefined();
    await act(async () => {
      resolveHydration?.(
        Response.json({
          turns: [
            {
              id: "f47ac10b-58cc-4372-a567-0e02b2c3d482",
              eventId: "event-hydrated-earlier",
              writerId: "writer-a",
              writerGeneration: 1,
              sequence: 1,
              sessionId: SESSION_ID,
              roomName: "interview-room",
              speaker: "interviewer",
              text: "Earlier durable turn",
              startedAt: "2099-07-15T21:00:00.000Z",
              endedAt: "2099-07-15T21:00:01.000Z",
              audioMs: 1000,
              section: "product_sense",
              deliveryState: "delivered",
            },
            {
              id: "f47ac10b-58cc-4372-a567-0e02b2c3d483",
              eventId: "event-runtime-during-retry",
              writerId: "writer-a",
              writerGeneration: 1,
              sequence: 2,
              sessionId: SESSION_ID,
              roomName: "interview-room",
              speaker: "user",
              text: "Runtime turn during retry",
              startedAt: "2099-07-15T21:00:02.000Z",
              endedAt: "2099-07-15T21:00:03.000Z",
              audioMs: 1000,
              section: "product_sense",
              deliveryState: "delivered",
            },
          ],
        })
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.transcriptTurns.map((turn) => turn.text)).toEqual([
        "Earlier durable turn",
        "Runtime turn during retry",
      ])
    );
    const telemetry = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleInfo.mock.calls,
    ]);
    expect(telemetry).toContain("transcript_hydration_retry");
    expect(telemetry).toContain("http_503");
    expect(telemetry).toContain("transcript_hydration_recovered");
    expect(telemetry).not.toContain(SESSION_ID);
    expect(telemetry).not.toContain("Runtime turn during retry");
  });

  it("recovers a transcript read after its browser deadline on an otherwise healthy connection", async () => {
    let transcriptReads = 0;
    let deadlineRequestAborted = false;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          if (transcriptReads === 1) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  deadlineRequestAborted = true;
                  const error = new Error("transcript request deadline");
                  error.name = "AbortError";
                  reject(error);
                },
                { once: true }
              );
            });
          }
          return Response.json({ turns: [] });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    vi.useFakeTimers();
    try {
      render(<InterviewPageContent />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId("livekit-room")).toBeInTheDocument();
      expect(transcriptReads).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          CUSTOMER_CLIENT_FETCH_DEADLINE_MS + 2_000
        );
        await Promise.resolve();
      });

      expect(deadlineRequestAborted).toBe(true);
      expect(transcriptReads).toBe(2);
      const telemetry = JSON.stringify([
        ...consoleWarn.mock.calls,
        ...consoleInfo.mock.calls,
      ]);
      expect(telemetry).toContain("timeout");
      expect(telemetry).toContain("transcript_hydration_recovered");
      expect(telemetry).not.toContain(SESSION_ID);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces bounded hydration failure and supports a single manual read retry", async () => {
    let transcriptReads = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          return transcriptReads <= 3
            ? Response.json(
                { error: "transcript_read_unavailable" },
                { status: 503 }
              )
            : Response.json({ turns: [] });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    const retry = await screen.findByRole(
      "button",
      { name: "Retry transcript" },
      { timeout: 3_000 }
    );
    expect(transcriptReads).toBe(3);
    expect(
      screen.getByText(/saved transcript couldn’t be loaded/i)
    ).toBeVisible();
    expect(screen.queryByText("Needs recovery")).toBeNull();

    fireEvent.click(retry);

    expect(
      await screen.findByText("No saved transcript turns yet.")
    ).toBeVisible();
    expect(transcriptReads).toBe(4);
    expect(
      screen.queryByRole("button", { name: "Retry transcript" })
    ).toBeNull();
  });

  it("retries a malformed successful hydration instead of presenting it as empty", async () => {
    let transcriptReads = 0;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          return transcriptReads === 1
            ? Response.json({ turns: { invalid: true } })
            : Response.json({ turns: [] });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(
      await screen.findByText("No saved transcript turns yet.")
    ).toBeVisible();
    expect(transcriptReads).toBe(2);
    expect(JSON.stringify(consoleWarn.mock.calls)).toContain("invalid_payload");
    expect(JSON.stringify(consoleInfo.mock.calls)).toContain(
      "transcript_hydration_recovered"
    );
  });

  it("clears an empty hydration label when a persisted runtime turn arrives", async () => {
    render(<InterviewPageContent />);

    expect(
      await screen.findByText("No saved transcript turns yet.")
    ).toBeVisible();
    await waitFor(() => expect(mocks.onTranscriptUpdate).not.toBeNull());

    await mocks.onTranscriptUpdate?.({
      persistable: true,
      eventId: "event-after-empty-hydration",
      sessionId: SESSION_ID,
      speaker: "user",
      text: "Persisted runtime answer",
      timestamp: new Date("2099-07-15T21:00:02.000Z"),
      event: {
        contract_version: 2,
        event_id: "event-after-empty-hydration",
        writer_id: "writer-a",
        writer_generation: 1,
        sequence: 1,
        session_id: SESSION_ID,
        room_name: "interview-room",
        speaker: "user",
        text: "Persisted runtime answer",
        is_final: true,
        started_at: "2099-07-15T21:00:02.000Z",
        ended_at: "2099-07-15T21:00:03.000Z",
        audio_duration_ms: 1000,
        section: "product_sense",
        delivery_state: "delivered",
      },
    });

    await waitFor(() =>
      expect(screen.queryByText("No saved transcript turns yet.")).toBeNull()
    );
    expect(mocks.transcriptTurns).toEqual([
      expect.objectContaining({ text: "Persisted runtime answer" }),
    ]);
  });

  it("retries a degraded hydration once when the tab becomes visible", async () => {
    let transcriptReads = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          return transcriptReads <= 3
            ? Response.json(
                { error: "transcript_read_unavailable" },
                { status: 503 }
              )
            : Response.json({ turns: [] });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    render(<InterviewPageContent />);
    expect(
      await screen.findByRole(
        "button",
        { name: "Retry transcript" },
        { timeout: 3_000 }
      )
    ).toBeVisible();
    expect(transcriptReads).toBe(3);

    fireEvent(document, new Event("visibilitychange"));

    expect(
      await screen.findByText("No saved transcript turns yet.")
    ).toBeVisible();
    expect(transcriptReads).toBe(4);
  });

  it.each([
    [401, "/auth/signin?redirectTo=/interview"],
    [404, "/dashboard"],
  ])(
    "fences transcript hydration after a definitive %s response",
    async (status, destination) => {
      let transcriptReads = 0;
      const request = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === `/api/session/${SESSION_ID}/transcript`) {
            transcriptReads += 1;
            return Response.json({ error: "unavailable" }, { status });
          }
          return activeInterviewResponse(input, init);
        }
      );
      vi.stubGlobal("fetch", request);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      render(<InterviewPageContent />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(destination)
      );
      expect(screen.queryByTestId("livekit-room")).toBeNull();
      expect(transcriptReads).toBe(1);
      expect(mocks.transcriptTurns).toEqual([]);
    }
  );

  it("aborts and fences a stale hydration response when the owner changes", async () => {
    let resolveHydration: ((response: Response) => void) | undefined;
    let hydrationAborted = false;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}/transcript`) {
          return new Promise<Response>((resolve) => {
            resolveHydration = resolve;
            init?.signal?.addEventListener(
              "abort",
              () => {
                hydrationAborted = true;
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(resolveHydration).toBeDefined());

    mocks.authUser = { id: "owner-b" };
    view.rerender(<InterviewPageContent />);
    await waitFor(() => expect(hydrationAborted).toBe(true));
    await act(async () => {
      resolveHydration?.(
        Response.json({
          turns: [
            {
              id: "stale-row",
              eventId: "stale-event",
              sessionId: SESSION_ID,
              speaker: "user",
              text: "Stale owner content",
              startedAt: "2099-07-15T21:00:00.000Z",
            },
          ],
        })
      );
      await Promise.resolve();
    });

    expect(mocks.transcriptTurns).toEqual([]);
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("aborts a stalled transcript hydration when the interview page unmounts", async () => {
    let hydrationStarted = false;
    let hydrationAborted = false;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}/transcript`) {
          hydrationStarted = true;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                hydrationAborted = true;
                const error = new Error("unmounted hydration");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(hydrationStarted).toBe(true));

    view.unmount();

    expect(hydrationAborted).toBe(true);
  });

  it("does not fan out transcript reads on agent-state churn and resyncs after recovery", async () => {
    let transcriptReads = 0;
    let firstRequestAborted = false;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}/transcript`) {
          transcriptReads += 1;
          if (transcriptReads === 1) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  firstRequestAborted = true;
                  const error = new Error("superseded hydration");
                  error.name = "AbortError";
                  reject(error);
                },
                { once: true }
              );
            });
          }
          return Response.json({
            turns: [
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
            ],
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(transcriptReads).toBe(1));
    await waitFor(() => expect(mocks.onAgentStateChange).not.toBeNull());
    await waitFor(() => expect(mocks.onConnectionStateChange).not.toBeNull());

    act(() => mocks.onAgentStateChange?.("thinking"));
    act(() => mocks.onAgentStateChange?.("speaking"));
    act(() => mocks.onAgentStateChange?.("listening"));
    expect(transcriptReads).toBe(1);

    act(() => mocks.onConnectionStateChange?.("recovered"));

    await waitFor(() =>
      expect(mocks.transcriptTurns).toEqual([
        expect.objectContaining({
          eventId: "event-recovered",
          text: "Recovered durable turn",
        }),
      ])
    );
    expect(firstRequestAborted).toBe(true);
    expect(transcriptReads).toBe(2);
  });

  it("renders the persisted question and company on normal room entry", async () => {
    const question =
      "Design a collaboration product for distributed product teams.";
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}`) {
          return activeInterviewResponseWithQuestion(question);
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: question })).toBeInTheDocument();
    expect(screen.getByText("Fixture Company")).toBeInTheDocument();
  });

  it("restores the persisted question and company after a room reload", async () => {
    const question = "Improve the activation flow for a PM collaboration tool.";
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}`) {
          return activeInterviewResponseWithQuestion(question);
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const firstEntry = render(<InterviewPageContent />);
    expect(
      await screen.findByRole("heading", { name: question })
    ).toBeInTheDocument();
    const sessionReadCount = () =>
      request.mock.calls.filter(
        ([input]) => String(input) === `/api/session/${SESSION_ID}`
      ).length;
    const readsBeforeReload = sessionReadCount();
    firstEntry.unmount();

    render(<InterviewPageContent />);

    expect(
      await screen.findByRole("heading", { name: question })
    ).toBeInTheDocument();
    expect(screen.getByText("Fixture Company")).toBeInTheDocument();
    await waitFor(() =>
      expect(sessionReadCount()).toBeGreaterThan(readsBeforeReload)
    );
  });

  it("keeps the room usable when the persisted question relation is absent", async () => {
    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Live PM interview" })
    ).toHaveClass("sr-only");
    expect(screen.queryByText("Fixture Company")).not.toBeInTheDocument();
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

  it("recovers a retryable session bootstrap on the same session before requesting one token", async () => {
    let sessionReads = 0;
    let tokenRequests = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}`) {
          sessionReads += 1;
          if (sessionReads === 1) {
            return Response.json(
              { error: "session_read_unavailable", retryable: true },
              { status: 503, headers: { "Retry-After": "0" } }
            );
          }
        }
        if (url === "/api/livekit/token") tokenRequests += 1;
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(sessionReads).toBe(2);
    expect(tokenRequests).toBe(1);
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/session/start"
      )
    ).toBe(false);
  });

  it("offers an explicit same-session retry after bounded bootstrap recovery", async () => {
    let sessionReads = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/session/${SESSION_ID}`) {
          sessionReads += 1;
          if (sessionReads <= 3) {
            return Response.json(
              { error: "session_read_unavailable", retryable: true },
              { status: 503, headers: { "Retry-After": "0" } }
            );
          }
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    const retry = await screen.findByRole("button", {
      name: "Retry interview room",
    });
    expect(sessionReads).toBe(3);
    expect(screen.getByText(/only session we’ll use/i)).toBeVisible();

    fireEvent.click(retry);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(sessionReads).toBe(4);
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/session/start"
      )
    ).toBe(false);
  });

  it.each([
    [401, "/auth/signin?redirectTo=/interview"],
    [403, "/dashboard"],
    [404, "/dashboard"],
  ])(
    "does not retry a definitive session bootstrap %s",
    async (status, destination) => {
      let sessionReads = 0;
      const request = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === `/api/session/${SESSION_ID}`) {
          sessionReads += 1;
          return Response.json({ error: "definitive" }, { status });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      vi.stubGlobal("fetch", request);

      render(<InterviewPageContent />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(destination)
      );
      expect(sessionReads).toBe(1);
      expect(
        request.mock.calls.some(
          ([input]) => String(input) === "/api/livekit/token"
        )
      ).toBe(false);
    }
  );

  it("surfaces a definitive unsafe-session bootstrap without retrying", async () => {
    let sessionReads = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === `/api/session/${SESSION_ID}`) {
        sessionReads += 1;
        return Response.json(
          { message: "This interview session cannot be resumed safely." },
          { status: 409 }
        );
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(
      await screen.findByText(
        "This interview session cannot be resumed safely."
      )
    ).toBeVisible();
    expect(sessionReads).toBe(1);
  });

  it("accepts the server-fenced credential handoff without a third browser session read", async () => {
    let sessionReads = 0;
    let tokenRequests = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}`) sessionReads += 1;
        if (url === "/api/livekit/token") tokenRequests += 1;
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(sessionReads).toBe(1);
    expect(tokenRequests).toBe(1);
    expect(request).toHaveBeenCalledWith(
      "/api/livekit/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: SESSION_ID }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("hands an ending session reload to feedback before requesting room credentials", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}`) {
        return Response.json({
          session: {
            id: SESSION_ID,
            livekitRoomName: "interview-room",
            startedAt: "2099-07-15T21:00:00.000Z",
            deadlineAt: "2099-07-15T22:00:00.000Z",
            lifecycleState: "ending",
            lifecycleVersion: 4,
            endedAt: null,
            feedbackReady: false,
            roundType: "product_sense",
            mode: "voice_video",
            config: { difficulty: "intermediate" },
          },
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/livekit/token"
      )
    ).toBe(false);
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
  });

  it("keeps End available without rotating credentials while runtime readiness is delayed", async () => {
    const request = vi.fn(activeInterviewResponse);
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onConnectionStateChange).not.toBeNull());
    await waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([input]) => String(input) === "/api/livekit/token"
        )
      ).toHaveLength(1)
    );

    act(() => mocks.onConnectionStateChange?.("delayed"));

    expect(
      await screen.findByText(/the interviewer is still joining/i)
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Microphone controls" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open end confirmation" })
    ).toBeEnabled();
    expect(
      request.mock.calls.filter(
        ([input]) => String(input) === "/api/livekit/token"
      )
    ).toHaveLength(1);
  });

  it("keeps End available without rotating credentials when transport connection is delayed", async () => {
    const request = vi.fn(activeInterviewResponse);
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onConnectionStateChange).not.toBeNull());

    act(() => mocks.onConnectionStateChange?.("transport_delayed"));

    expect(
      await screen.findByText(/room connection is taking longer than expected/i)
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Microphone controls" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open end confirmation" })
    ).toBeEnabled();
    expect(
      request.mock.calls.filter(
        ([input]) => String(input) === "/api/livekit/token"
      )
    ).toHaveLength(1);
  });

  it("enables conversation controls when a live interviewer is active while canonical readiness syncs", async () => {
    const request = vi.fn(activeInterviewResponse);
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onConnectionStateChange).not.toBeNull());
    await waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([input]) => String(input) === "/api/livekit/token"
        )
      ).toHaveLength(1)
    );

    act(() => mocks.onConnectionStateChange?.("syncing"));

    expect(
      await screen.findByText(/interview active\. syncing status/i)
    ).toBeVisible();
    expect(
      screen.queryByText(/the interviewer is still joining/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Microphone controls" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Open end confirmation" })
    ).toBeEnabled();
    expect(
      request.mock.calls.filter(
        ([input]) => String(input) === "/api/livekit/token"
      )
    ).toHaveLength(1);
  });

  it("emits mic toggle analytics only after LiveKit acknowledges the state", async () => {
    render(<InterviewPageContent />);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.microphoneEnabled).toBe(true));

    const acknowledgement = deferred<unknown>();
    mocks.setMicrophoneEnabled.mockImplementationOnce(
      async (enabled: boolean) => {
        await acknowledgement.promise;
        mocks.microphoneEnabled = enabled;
        return undefined;
      }
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Microphone controls" })
    );
    expect(
      mocks.analyticsTrack.mock.calls.filter(
        ([eventName]) => eventName === "mic_toggled"
      )
    ).toHaveLength(0);

    acknowledgement.resolve(undefined);
    await waitFor(() =>
      expect(mocks.analyticsTrack).toHaveBeenCalledWith("mic_toggled", {
        session_id: SESSION_ID,
        new_state: "muted",
      })
    );
  });

  it("keeps End available while initial room credentials are still loading", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/livekit/token") {
        return new Promise<Response>(() => undefined);
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    const heading = await screen.findByRole("heading", {
      name: "Connecting to your interviewer",
    });
    const overlay = heading.closest('[role="status"]');
    expect(overlay).not.toBeNull();
    expect(
      within(overlay as HTMLElement).getByRole("button", {
        name: "Microphone controls",
      })
    ).toBeDisabled();

    fireEvent.click(
      within(overlay as HTMLElement).getByRole("button", {
        name: "Open end confirmation",
      })
    );
    expect(screen.getByRole("button", { name: "Confirm end" })).toBeEnabled();
  });

  it("aborts a stalled credential request when the interview page unmounts", async () => {
    const credentialRequest = { signal: null as AbortSignal | null };
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/livekit/token") {
          credentialRequest.signal = init?.signal ?? null;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                const error = new Error("credential request unmounted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<InterviewPageContent />);
    await screen.findByRole("heading", {
      name: "Connecting to your interviewer",
    });
    expect(credentialRequest.signal?.aborted).toBe(false);

    view.unmount();

    expect(credentialRequest.signal?.aborted).toBe(true);
  });

  it("aborts credential retry sleep when End takes ownership", async () => {
    let tokenRequests = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/livekit/token") {
          tokenRequests += 1;
          return Response.json(
            { error: "interview_token_unavailable" },
            { status: 503, headers: { "Retry-After": "0.05" } }
          );
        }
        if (url === "/api/interview/end") {
          return Response.json({
            nextHref: `/feedback/${SESSION_ID}/loading`,
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    const heading = await screen.findByRole("heading", {
      name: "Connecting to your interviewer",
    });
    const overlay = heading.closest('[role="status"]');
    expect(overlay).not.toBeNull();
    await waitFor(() => expect(tokenRequests).toBe(1));

    fireEvent.click(
      within(overlay as HTMLElement).getByRole("button", {
        name: "Open end confirmation",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
    expect(mocks.push).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tokenRequests).toBe(1);
  });

  it("aborts stale credential work when the authenticated owner changes", async () => {
    let credentialSignal: AbortSignal | null = null;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/livekit/token") {
          credentialSignal = init?.signal ?? null;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                const error = new Error("credential owner changed");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<InterviewPageContent />);
    await screen.findByRole("heading", {
      name: "Connecting to your interviewer",
    });

    mocks.authUser = { id: "owner-b" };
    view.rerender(<InterviewPageContent />);

    await waitFor(() => expect(credentialSignal?.aborted).toBe(true));
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByTestId("livekit-room")).toBeNull();
  });

  it("uses the same single end command while the room reconnects", async () => {
    let endRequests = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interview/end") {
        endRequests += 1;
        return Response.json({
          nextHref: `/feedback/${SESSION_ID}/loading`,
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onConnectionStateChange).not.toBeNull());

    act(() => mocks.onConnectionStateChange?.("reconnecting"));

    const heading = await screen.findByRole("heading", {
      name: "Restoring your interview",
    });
    const overlay = heading.closest('[role="status"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(
      within(overlay as HTMLElement).getByRole("button", {
        name: "Open end confirmation",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

    await waitFor(() => expect(endRequests).toBe(1));
    expect(mocks.replace).toHaveBeenCalledWith(
      `/feedback/${SESSION_ID}/loading`
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("aborts a stalled automatic-deadline read and continues polling terminal truth", async () => {
    let deadlinePolling = false;
    let deadlineReads = 0;
    let firstReadAborted = false;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}` && deadlinePolling) {
          deadlineReads += 1;
          if (deadlineReads === 1) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  firstReadAborted = true;
                  const error = new Error("deadline poll aborted");
                  error.name = "AbortError";
                  reject(error);
                },
                { once: true }
              );
            });
          }
          return Response.json({
            session: {
              lifecycleState: "completed",
              feedbackReady: false,
            },
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onDeadlineReached).not.toBeNull());

    vi.useFakeTimers();
    try {
      deadlinePolling = true;
      await act(async () => {
        mocks.onDeadlineReached?.();
        await Promise.resolve();
      });
      expect(deadlineReads).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          CUSTOMER_CLIENT_FETCH_DEADLINE_MS + 1_100
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(firstReadAborted).toBe(true);
      expect(deadlineReads).toBe(2);
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps sequential terminal polling and starts only one manual or visibility retry window", async () => {
    let terminalPolling = false;
    let terminalReads = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}` && terminalPolling) {
        terminalReads += 1;
        return Response.json(
          { error: "session_read_unavailable" },
          { status: 503 }
        );
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onDeadlineReached).not.toBeNull());

    vi.useFakeTimers();
    try {
      terminalPolling = true;
      await act(async () => {
        mocks.onDeadlineReached?.();
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TERMINAL_POLL_WINDOW_MS);
      });

      expect(terminalReads).toBe(TERMINAL_POLL_MAX_ATTEMPTS);
      const pausedHeading = screen.getByRole("heading", {
        name: "Automatic checking paused",
      });
      expect(pausedHeading.closest('[role="status"]')).toHaveAttribute(
        "aria-busy",
        "false"
      );
      expect(screen.getByText(/safe to leave this page/i)).toBeVisible();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        fireEvent(document, new Event("visibilitychange"));
        await Promise.resolve();
      });
      expect(terminalReads).toBe(TERMINAL_POLL_MAX_ATTEMPTS + 1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TERMINAL_POLL_WINDOW_MS);
      });
      expect(terminalReads).toBe(TERMINAL_POLL_MAX_ATTEMPTS * 2);
      fireEvent.click(
        screen.getByRole("button", { name: "Interview history" })
      );
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/history");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels terminal polling on unmount without scheduling later work", async () => {
    let terminalPolling = false;
    let terminalReads = 0;
    let terminalReadAborted = false;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}` && terminalPolling) {
          terminalReads += 1;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                terminalReadAborted = true;
                const error = new Error("terminal poll aborted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onDeadlineReached).not.toBeNull());

    vi.useFakeTimers();
    try {
      terminalPolling = true;
      await act(async () => {
        mocks.onDeadlineReached?.();
        await Promise.resolve();
      });
      expect(terminalReads).toBe(1);

      view.unmount();
      expect(terminalReadAborted).toBe(true);
      await vi.advanceTimersByTimeAsync(TERMINAL_POLL_WINDOW_MS * 2);
      expect(terminalReads).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("navigates once when terminal truth wins a poll window", async () => {
    let terminalPolling = false;
    let terminalReads = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/session/${SESSION_ID}` && terminalPolling) {
        terminalReads += 1;
        return Response.json({
          session: { lifecycleState: "completed", feedbackReady: false },
        });
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    await waitFor(() => expect(mocks.onDeadlineReached).not.toBeNull());

    terminalPolling = true;
    act(() => mocks.onDeadlineReached?.());
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
    fireEvent(document, new Event("visibilitychange"));

    expect(terminalReads).toBe(1);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
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

  it("makes exhausted retryable credentials actionable without creating another session", async () => {
    let tokenRequests = 0;
    let sessionReads = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/session/${SESSION_ID}`) sessionReads += 1;
        if (url === "/api/livekit/token") {
          tokenRequests += 1;
          if (tokenRequests <= 3) {
            return Response.json(
              { error: "interview_token_unavailable" },
              { status: 503, headers: { "Retry-After": "0" } }
            );
          }
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);

    const retry = await screen.findByRole("button", {
      name: "Retry room connection",
    });
    expect(tokenRequests).toBe(3);
    expect(sessionReads).toBe(1);
    expect(
      screen.getByRole("button", { name: "Open end confirmation" })
    ).toBeEnabled();

    fireEvent.click(retry);

    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();
    expect(tokenRequests).toBe(4);
    expect(sessionReads).toBe(1);
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/session/start"
      )
    ).toBe(false);
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

  it("pauses ambiguous-End reconciliation at the same terminal poll cap", async () => {
    let endRequested = false;
    let terminalReads = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interview/end") {
        endRequested = true;
        throw new TypeError("connection reset after request write");
      }
      if (url === `/api/session/${SESSION_ID}` && endRequested) {
        terminalReads += 1;
        return Response.json(
          { error: "session_read_unavailable" },
          { status: 503 }
        );
      }
      return activeInterviewResponse(input);
    });
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Open end confirmation" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(terminalReads).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TERMINAL_POLL_WINDOW_MS);
      });

      expect(terminalReads).toBe(TERMINAL_POLL_MAX_ATTEMPTS);
      const pausedHeading = screen.getByRole("heading", {
        name: "Automatic checking paused",
      });
      expect(pausedHeading.closest('[role="status"]')).toHaveAttribute(
        "aria-busy",
        "false"
      );
      expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      )
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(
        ([input]) => String(input) === "/api/interview/runtime-settlement"
      )
    ).toBe(false);
  });

  it("accepts an End response between 5.0 seconds and the server breaker", async () => {
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/interview/end") {
          return new Promise<Response>((resolve, reject) => {
            const timer = window.setTimeout(
              () =>
                resolve(
                  Response.json(
                    {
                      status: "settling",
                      nextHref: `/feedback/${SESSION_ID}/loading`,
                    },
                    { status: 202 }
                  )
                ),
              5_250
            );
            init?.signal?.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timer);
                const error = new Error("end acceptance aborted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }
        return activeInterviewResponse(input, init);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<InterviewPageContent />);
    expect(await screen.findByTestId("livekit-room")).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Open end confirmation" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirm end" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_001);
      });
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("heading", {
          name: "Confirming interview completion",
        })
      ).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(249);
      });
      expect(mocks.replace).toHaveBeenCalledWith(
        `/feedback/${SESSION_ID}/loading`
      );
      expect(mocks.replace).toHaveBeenCalledTimes(1);
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

function activeInterviewResponseWithQuestion(question: string) {
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
      question: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        text: question,
        company: "Fixture Company",
      },
    },
  });
}

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

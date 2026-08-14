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

const ATTEMPT_ID = "10000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  fetchWithDeadline: vi.fn(),
  permissionTrackStop: vi.fn(),
  push: vi.fn(),
  storeCredentials: vi.fn(),
  validateSessionStart: vi.fn(),
  searchParams: new URLSearchParams(),
  settings: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "candidate-owner", email: "candidate@example.com" },
    isLoading: false,
  }),
}));

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ReactModule.forwardRef(
          (
            {
              children,
              variants: _variants,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              ...props
            }: React.HTMLAttributes<HTMLElement> & {
              children?: React.ReactNode;
              variants?: unknown;
              initial?: unknown;
              animate?: unknown;
              exit?: unknown;
              transition?: unknown;
            },
            ref
          ) => ReactModule.createElement(tag, { ...props, ref }, children)
        ),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ReactModule.forwardRef(
      (
        {
          children,
          variant: _variant,
          ...props
        }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string },
        ref: React.ForwardedRef<HTMLButtonElement>
      ) => ReactModule.createElement("button", { ...props, ref }, children)
    ),
  };
});

vi.mock("@/components/dashboard/layout/dashboard-page", () => ({
  DashboardPage: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/app-surface", () => ({
  StatusPill: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/dashboard/quota-exceeded-modal", () => ({
  QuotaExceededModal: () => null,
}));

vi.mock("@/components/dashboard/tier-upgrade-modal", () => ({
  TierUpgradeModal: () => null,
}));

vi.mock("./components/round-selector", () => ({ RoundSelector: () => null }));
vi.mock("./components/difficulty-selector", () => ({
  DifficultySelector: () => null,
}));
vi.mock("./components/selected-question-confirmation", () => ({
  SelectedQuestionConfirmation: () => null,
}));
vi.mock("./components/interview-data-disclosure", () => ({
  InterviewDataDisclosure: () => null,
}));
vi.mock("./use-selected-question-intent", () => ({
  useSelectedQuestionIntent: () => ({
    state: { status: "none" },
    retry: vi.fn(),
  }),
}));

vi.mock("@/lib/analytics", () => ({
  AnalyticsEvents: { SETUP_PAGE_VIEWED: "setup_page_viewed" },
  track: vi.fn(),
}));
vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: vi.fn() },
}));

vi.mock("@/lib/analytics/interview-launch-compat", () => ({
  trackInterviewLaunchEvent: vi.fn(),
}));

vi.mock("@/lib/analytics/use-web-vitals", () => ({
  useWebVitals: () => undefined,
}));

vi.mock("@/lib/http/deadline", () => ({
  fetchWithDeadline: mocks.fetchWithDeadline,
}));

vi.mock("@/lib/validation/setup-schema", () => ({
  validateSessionStart: mocks.validateSessionStart,
}));
vi.mock("@/lib/operations/interview-start-slo", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/operations/interview-start-slo")
    >();
  return {
    ...actual,
    INTERVIEW_START_SLOS: {
      ...actual.INTERVIEW_START_SLOS,
      launch_request: { targetMs: 5, upperBoundMs: 20 },
    },
  };
});
vi.mock("@/components/interview/session-recovery", () => ({
  getCanonicalInterviewHref: (sessionId: string) =>
    `/interview?sessionId=${sessionId}`,
}));
vi.mock("@/lib/interview/room-credential-handoff", () => ({
  storeInitialInterviewRoomCredentials: mocks.storeCredentials,
}));

import { SetupContent } from "./setup-content";

describe("interview setup microphone permission check", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.searchParams = new URLSearchParams();
    mocks.settings = null;
    mocks.validateSessionStart.mockImplementation((data: unknown) => ({
      success: true,
      data,
    }));
    const abortError = new Error("launch request timed out");
    abortError.name = "AbortError";
    mocks.fetchWithDeadline.mockRejectedValue(abortError);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/billing/credits") {
          return Response.json({
            availableCredits: 1,
            reservedCredits: 0,
            nextCreditExpiresAt: null,
            trialAvailable: false,
          });
        }
        if (String(input) === "/api/user/settings") {
          return Response.json({ settings: mocks.settings });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("stops every permission-check track when interview launch times out", async () => {
    const { getUserMedia, tracks } = installPermissionStream();

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    expect(
      await screen.findByText(/no second click or extra credit is needed/i)
    ).toHaveTextContent(/same start attempt/i);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWithDeadline).toHaveBeenCalled();
    await waitFor(() => {
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalledTimes(1);
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel start" }));
    await screen.findByText(/interview start canceled/i);
  });

  it("releases the permission stream before a successful launch request", async () => {
    const { tracks } = installPermissionStream();
    mocks.fetchWithDeadline.mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        for (const track of tracks) {
          expect(track.stop).toHaveBeenCalledTimes(1);
        }
        const startBody = JSON.parse(String(init?.body));
        expect(startBody).not.toHaveProperty("permissionStream");
        expect(Object.keys(startBody).sort()).toEqual([
          "config",
          "mode",
          "roundType",
          "startAttemptId",
        ]);
        return Response.json({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          token: "short-lived-token",
          url: "wss://preview.livekit.cloud",
          roomName: "interview-room",
        });
      }
    );

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/interview?sessionId=550e8400-e29b-41d4-a716-446655440000"
      )
    );
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    [500, { message: "Launch failed" }],
    [
      403,
      {
        error: "interview_type_locked",
        message: "This interview type requires an interview credit.",
      },
    ],
    [402, { error: "no_credits_remaining" }],
  ])("releases every track after an HTTP %s response", async (status, body) => {
    const { tracks } = installPermissionStream();
    mocks.fetchWithDeadline.mockResolvedValue(Response.json(body, { status }));

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    await waitFor(() => expect(mocks.fetchWithDeadline).toHaveBeenCalled());
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("releases every track before reporting a validation failure", async () => {
    const { tracks } = installPermissionStream();
    mocks.validateSessionStart.mockReturnValue({
      success: false,
      error: "Invalid interview setup",
    });

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    await waitFor(() =>
      expect(mocks.validateSessionStart).toHaveBeenCalledTimes(1)
    );
    expect(mocks.fetchWithDeadline).not.toHaveBeenCalled();
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("loads saved launcher defaults and carries company context into the validated start", async () => {
    mocks.searchParams = new URLSearchParams("company=Acme");
    mocks.settings = {
      defaultInterviewType: "analytical",
      defaultDifficulty: "hard",
      questionRecency: "recent",
    };
    installPermissionStream();

    render(<SetupContent voiceUnavailableInPreview={false} />);
    await waitFor(() =>
      expect(screen.getByText("Execution · Senior PM")).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    await waitFor(() => {
      expect(mocks.validateSessionStart).toHaveBeenCalledWith(
        expect.objectContaining({
          roundType: "execution",
          company: "Acme",
          config: expect.objectContaining({
            difficulty: "advanced",
            questionPreference: { recency: "recent", recentDays: 730 },
          }),
        })
      );
    });
  });

  it("keeps explicit URL round and difficulty ahead of saved defaults", async () => {
    mocks.searchParams = new URLSearchParams(
      "interview_type=strategy&difficulty=beginner"
    );
    mocks.settings = {
      defaultInterviewType: "analytical",
      defaultDifficulty: "hard",
      questionRecency: "all",
    };

    render(<SetupContent voiceUnavailableInPreview={false} />);

    await waitFor(() =>
      expect(screen.getByText("Strategy · Junior/APM")).toBeInTheDocument()
    );
  });

  it("preserves the actionable denial message without trying to clean an absent stream", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(
        new DOMException("Permission denied", "NotAllowedError")
      );
    installGetUserMedia(getUserMedia);

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );

    await screen.findByText(
      "Microphone access is required for voice interviews. Please grant permission and try again."
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(mocks.fetchWithDeadline).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Start mock interview" })
    ).toBeEnabled();
  });

  it("does not overlap permission checks on repeated starts", async () => {
    let resolvePermission: ((stream: MediaStream) => void) | undefined;
    const permission = new Promise<MediaStream>((resolve) => {
      resolvePermission = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(permission);
    installGetUserMedia(getUserMedia);
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];

    const view = render(
      <React.StrictMode>
        <SetupContent voiceUnavailableInPreview={false} />
      </React.StrictMode>
    );
    const startButton = screen.getByRole("button", {
      name: "Start mock interview",
    });
    act(() => {
      fireEvent.click(startButton);
      fireEvent.click(startButton);
    });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    view.unmount();
    resolvePermission?.({ getTracks: () => tracks } as unknown as MediaStream);
    await waitFor(() => {
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalledTimes(1);
      }
    });
  });

  it("stops a permission stream that resolves after unmount without launching", async () => {
    let resolvePermission: ((stream: MediaStream) => void) | undefined;
    const permission = new Promise<MediaStream>((resolve) => {
      resolvePermission = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(permission);
    installGetUserMedia(getUserMedia);
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];

    const view = render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    view.unmount();

    await act(async () => {
      resolvePermission?.({
        getTracks: () => tracks,
      } as unknown as MediaStream);
      await permission;
    });

    await waitFor(() => {
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalledTimes(1);
      }
    });
    expect(mocks.fetchWithDeadline).not.toHaveBeenCalled();
  });

  it("never requests a permission stream when voice is unavailable in Preview", () => {
    const getUserMedia = vi.fn();
    installGetUserMedia(getUserMedia);

    render(<SetupContent voiceUnavailableInPreview />);

    expect(
      screen.getByRole("button", { name: "Voice unavailable in Preview" })
    ).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mocks.fetchWithDeadline).not.toHaveBeenCalled();
  });
});

function installPermissionStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  installGetUserMedia(getUserMedia);
  return { getUserMedia, stream, tracks };
}

function installGetUserMedia(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

describe("setup interview start recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.validateSessionStart.mockImplementation((data: unknown) => ({
      success: true,
      data,
    }));
    mocks.searchParams = new URLSearchParams();
    mocks.settings = null;
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ID);
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: mocks.permissionTrackStop }],
        }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        if (String(input) === "/api/billing/credits") return creditsResponse();
        if (String(input) === "/api/user/settings") {
          return jsonResponse(200, { settings: mocks.settings });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses one durable single-flight attempt from browser abort through ready", async () => {
    const startBodies: Array<Record<string, unknown>> = [];
    const requestDeadlines: number[] = [];
    let startRequests = 0;
    let activeRequests = 0;
    let maxActiveRequests = 0;

    mocks.fetchWithDeadline.mockImplementation(
      async (_input, init, deadlineMs) => {
        startRequests += 1;
        startBodies.push(JSON.parse(String(init?.body)));
        requestDeadlines.push(deadlineMs);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        if (startRequests === 1) {
          return new Promise<Response>((_resolve, reject) => {
            setTimeout(() => {
              activeRequests -= 1;
              reject(abortError("browser deadline"));
            }, deadlineMs);
          });
        }

        activeRequests -= 1;
        if (startRequests === 2) {
          return jsonResponse(
            503,
            { retryable: true, retryAfterMs: 1 },
            { "Retry-After": "0" }
          );
        }

        return jsonResponse(200, {
          sessionId: ATTEMPT_ID,
          roomName: `interview-${ATTEMPT_ID}`,
          token: "join-token",
          url: "wss://preview.example.test",
        });
      }
    );

    render(<SetupContent voiceUnavailableInPreview={false} />);
    const startButton = screen.getByRole("button", {
      name: "Start mock interview",
    });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(
      await screen.findByText(/no second click or extra credit is needed/i)
    ).toHaveTextContent(/same start attempt/i);
    expect(
      await screen.findByRole("button", { name: "Cancel start" })
    ).toBeEnabled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

    expect(startRequests).toBe(3);
    expect(maxActiveRequests).toBe(1);
    expect(requestDeadlines).toEqual([20, 20, 20]);
    expect(startBodies).toHaveLength(3);
    expect(startBodies[1]).toEqual(startBodies[0]);
    expect(startBodies[2]).toEqual(startBodies[0]);
    expect(new Set(startBodies.map((body) => body.startAttemptId))).toEqual(
      new Set([ATTEMPT_ID])
    );
    expect(mocks.storeCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.permissionTrackStop).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      `/interview?sessionId=${ATTEMPT_ID}`
    );
  });

  it("unmount aborts recovery without issuing a later replay or navigation", async () => {
    let startRequests = 0;
    stubStartThatStaysBusy(() => {
      startRequests += 1;
      return startRequests;
    });

    const view = render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );
    await screen.findByText(/no second click or extra credit is needed/i);

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(startRequests).toBe(1);
    expect(mocks.storeCredentials).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("candidate cancel stops recovery without issuing a later replay", async () => {
    let startRequests = 0;
    stubStartThatStaysBusy(() => {
      startRequests += 1;
      return startRequests;
    });

    render(<SetupContent voiceUnavailableInPreview={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );
    await screen.findByText(/no second click or extra credit is needed/i);
    fireEvent.click(screen.getByRole("button", { name: "Cancel start" }));
    await screen.findByText(/interview start canceled/i);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(startRequests).toBe(1);
    expect(mocks.storeCredentials).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

function stubStartThatStaysBusy(nextRequest: () => number) {
  mocks.fetchWithDeadline.mockImplementation(
    async (_input, _init, deadlineMs) => {
      const requestNumber = nextRequest();
      if (requestNumber === 1) {
        return new Promise<Response>((_resolve, reject) =>
          setTimeout(() => reject(abortError("browser deadline")), deadlineMs)
        );
      }
      return jsonResponse(
        503,
        { retryable: true, retryAfterMs: 1_000 },
        { "Retry-After": "1" }
      );
    }
  );
}

function creditsResponse() {
  return jsonResponse(200, {
    availableCredits: 1,
    reservedCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  });
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

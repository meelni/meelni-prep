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

const mocks = vi.hoisted(() => ({
  fetchWithDeadline: vi.fn(),
  push: vi.fn(),
  validateSessionStart: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "owner-a" }, isLoading: false }),
}));

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const createMotionComponent = (tag: "div" | "section") =>
    ReactModule.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
      ({ children, ...props }, ref) =>
        ReactModule.createElement(tag, { ...props, ref }, children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createMotionComponent("div"),
      section: createMotionComponent("section"),
    },
    useReducedMotion: () => true,
  };
});

vi.mock("@/components/dashboard/layout/dashboard-page", () => ({
  DashboardPage: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("./components/round-selector", () => ({
  RoundSelector: () => null,
}));

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

vi.mock("@/components/dashboard/quota-exceeded-modal", () => ({
  QuotaExceededModal: () => null,
}));

vi.mock("@/components/dashboard/tier-upgrade-modal", () => ({
  TierUpgradeModal: () => null,
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

import { SetupContent } from "./setup-content";

describe("interview setup microphone permission check", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
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
      await screen.findByText(/taking longer than expected/i)
    ).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWithDeadline).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalledTimes(1);
      }
    });
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

    expect(await screen.findByText("Invalid interview setup")).toBeVisible();
    expect(mocks.fetchWithDeadline).not.toHaveBeenCalled();
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
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

    expect(
      await screen.findByText(
        "Microphone access is required for voice interviews. Please grant permission and try again."
      )
    ).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
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

    expect(getUserMedia).toHaveBeenCalledTimes(1);
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
    expect(getUserMedia).toHaveBeenCalledTimes(1);
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

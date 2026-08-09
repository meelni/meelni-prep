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

const ATTEMPT_ID = "10000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  storeCredentials: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
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

describe("setup interview start recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ATTEMPT_ID);
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({}) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("needs one click when the first request commits after the browser abort", async () => {
    const startBodies: Array<Record<string, unknown>> = [];
    let startRequests = 0;
    let activeRequests = 0;
    let maxActiveRequests = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === "/api/billing/credits") {
          return jsonResponse(200, {
            availableCredits: 1,
            reservedCredits: 0,
            nextCreditExpiresAt: null,
            trialAvailable: false,
          });
        }

        startRequests += 1;
        startBodies.push(JSON.parse(String(init?.body)));
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        if (startRequests === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                activeRequests -= 1;
                const error = new Error("browser deadline");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }

        activeRequests -= 1;
        if (startRequests === 2) {
          return jsonResponse(
            503,
            { error: "interview_start_in_progress", retryable: true },
            { "Retry-After": "1" }
          );
        }

        return jsonResponse(200, {
          sessionId: ATTEMPT_ID,
          roomName: `interview-${ATTEMPT_ID}`,
          token: "join-token",
          url: "wss://preview.example.test",
        });
      })
    );

    render(<SetupContent />);
    const startButton = screen.getByRole("button", {
      name: "Start mock interview",
    });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    const recoveryStatus = await screen.findByText(
      /no second click is needed/i
    );
    expect(recoveryStatus).toHaveTextContent(/same start attempt/i);
    expect(
      await screen.findByRole("button", { name: "Cancel start" })
    ).toBeEnabled();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

    expect(startRequests).toBe(3);
    expect(maxActiveRequests).toBe(1);
    expect(startBodies).toHaveLength(3);
    expect(new Set(startBodies.map((body) => body.startAttemptId))).toEqual(
      new Set([ATTEMPT_ID])
    );
    expect(mocks.storeCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      `/interview?sessionId=${ATTEMPT_ID}`
    );
  });

  it("aborts recovery on unmount without issuing another replay", async () => {
    let startRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === "/api/billing/credits") {
          return jsonResponse(200, { availableCredits: 1 });
        }
        startRequests += 1;
        if (startRequests === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("browser deadline");
              error.name = "AbortError";
              reject(error);
            });
          });
        }
        return jsonResponse(
          503,
          { retryable: true, retryAfterMs: 1_000 },
          { "Retry-After": "1" }
        );
      })
    );

    const view = render(<SetupContent />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start mock interview" })
    );
    await waitFor(() => expect(startRequests).toBe(2));

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(startRequests).toBe(2);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

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

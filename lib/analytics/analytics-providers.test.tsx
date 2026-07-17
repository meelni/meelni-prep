// @vitest-environment jsdom

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const posthog = {
    __loaded: false,
    debug: vi.fn(),
    has_opted_in_capturing: vi.fn(() => true),
    init: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    stopSessionRecording: vi.fn(),
  };
  const statsigClient = {
    checkGate: vi.fn(() => false),
    initializeAsync: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    updateUserAsync: vi.fn().mockResolvedValue(undefined),
  };

  return {
    clearStatsigAnonymousIdentifiers: vi.fn(),
    consent: {
      decision: "undecided" as "undecided" | "accepted" | "declined",
      resolved: true,
    },
    getOrCreateStatsigAnonymousId: vi.fn(() => "anon-test"),
    posthog,
    statsigClient,
    StatsigClient: vi.fn(function StatsigClientMock(
      _clientKey: string,
      _user: unknown,
      _options: Record<string, unknown>
    ) {
      return statsigClient;
    }),
  };
});

mocks.posthog.init.mockImplementation(() => {
  mocks.posthog.__loaded = true;
});

vi.mock("posthog-js", () => ({ default: mocks.posthog }));
vi.mock("posthog-js/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@statsig/js-client", () => ({
  StatsigClient: mocks.StatsigClient,
}));
vi.mock("@/app/providers/analytics-consent-provider", () => ({
  useAnalyticsConsent: () => mocks.consent,
}));
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("@/lib/feature-flags/anonymous-id", () => ({
  clearStatsigAnonymousIdentifiers: mocks.clearStatsigAnonymousIdentifiers,
  getOrCreateStatsigAnonymousId: mocks.getOrCreateStatsigAnonymousId,
}));
vi.mock("@/lib/feature-flags/config", () => ({
  buildStatsigUser: ({ anonymousId }: { anonymousId: string }) => ({
    userID: anonymousId,
  }),
  getStatsigConfig: () => ({
    apiUrl: "/api/statsig",
    clientKey: "client-test",
    debug: false,
    enabled: true,
    environmentTier: "development",
  }),
  localFeatureFlagOverridesEnabled: () => false,
}));
vi.mock("@/lib/analytics/config", () => ({
  clientConfig: {
    apiKey: "phc_test",
    debug: false,
    enabled: true,
    host: "https://posthog.example.test",
    privacy: {
      anonymizeIp: true,
      disableAutocapture: true,
      disablePageviewTracking: true,
    },
    sessionRecording: {
      enabled: false,
      maskAllText: true,
      maskEmails: true,
      maskTextInputs: true,
      sampleRate: 0,
    },
  },
}));

import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { StatsigProvider } from "@/lib/feature-flags/statsig-provider";

describe("optional analytics provider lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.posthog.__loaded = false;
    mocks.posthog.has_opted_in_capturing.mockReturnValue(true);
    mocks.consent.decision = "undecided";
  });

  it("initializes PostHog exactly once only after acceptance and withdraws immediately", async () => {
    const view = render(
      <PostHogProvider>
        <span>child</span>
      </PostHogProvider>
    );

    expect(mocks.posthog.init).not.toHaveBeenCalled();

    mocks.consent.decision = "accepted";
    view.rerender(
      <PostHogProvider>
        <span>child</span>
      </PostHogProvider>
    );
    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalledTimes(1));
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledTimes(1);

    view.rerender(
      <PostHogProvider>
        <span>child</span>
      </PostHogProvider>
    );
    expect(mocks.posthog.init).toHaveBeenCalledTimes(1);

    mocks.consent.decision = "declined";
    view.rerender(
      <PostHogProvider>
        <span>child</span>
      </PostHogProvider>
    );
    await waitFor(() =>
      expect(mocks.posthog.stopSessionRecording).toHaveBeenCalledTimes(1)
    );
    expect(mocks.posthog.reset).toHaveBeenCalledWith(true);
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
  });

  it("creates no Statsig identity or client before acceptance and shuts down on withdrawal", async () => {
    const view = render(
      <StatsigProvider initialGateValues={{ relaunch: false }}>
        <span>child</span>
      </StatsigProvider>
    );

    expect(mocks.getOrCreateStatsigAnonymousId).not.toHaveBeenCalled();
    expect(mocks.StatsigClient).not.toHaveBeenCalled();

    mocks.consent.decision = "accepted";
    view.rerender(
      <StatsigProvider initialGateValues={{ relaunch: false }}>
        <span>child</span>
      </StatsigProvider>
    );
    await waitFor(() => expect(mocks.StatsigClient).toHaveBeenCalledTimes(1));
    expect(mocks.statsigClient.initializeAsync).toHaveBeenCalledTimes(1);
    const options = mocks.StatsigClient.mock.calls[0]?.[2];
    expect(options).toMatchObject({
      disableStableID: true,
      disableStorage: true,
      loggingEnabled: "disabled",
    });
    expect(options).not.toHaveProperty("plugins");

    mocks.consent.decision = "declined";
    view.rerender(
      <StatsigProvider initialGateValues={{ relaunch: false }}>
        <span>child</span>
      </StatsigProvider>
    );
    await waitFor(() =>
      expect(mocks.statsigClient.shutdown).toHaveBeenCalledTimes(1)
    );
    expect(mocks.clearStatsigAnonymousIdentifiers).toHaveBeenCalled();
  });
});

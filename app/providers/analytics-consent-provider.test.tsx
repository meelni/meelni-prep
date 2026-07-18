// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoading: true,
    user: { id: "user-a" } as { id: string } | null,
  },
  clearStatsigAnonymousIdentifiers: vi.fn(),
  purgeLegacyPostHogIdentity: vi.fn(),
  resetAnalytics: vi.fn(),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("@/lib/feature-flags/anonymous-id", () => ({
  clearStatsigAnonymousIdentifiers: mocks.clearStatsigAnonymousIdentifiers,
}));
vi.mock("@/lib/analytics/posthog-legacy-purge", () => ({
  purgeLegacyPostHogIdentity: mocks.purgeLegacyPostHogIdentity,
}));
vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { reset: mocks.resetAnalytics },
}));

import {
  AnalyticsConsentProvider,
  useAnalyticsConsent,
} from "./analytics-consent-provider";

const acceptedConsent = {
  decision: "accepted" as const,
  policyVersion: 1,
  source: "settings" as const,
  decidedAt: "2026-07-10T12:00:00.000Z",
  scope: "account" as const,
};

function ConsentState() {
  const state = useAnalyticsConsent();
  return (
    <output>
      <span data-testid="resolved">{String(state.resolved)}</span>
      <span data-testid="pseudonym">{state.analyticsPseudonym ?? "none"}</span>
      <span data-testid="sync-pending">{String(state.accountSyncPending)}</span>
    </output>
  );
}

describe("AnalyticsConsentProvider hydration", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.auth.isLoading = true;
    mocks.auth.user = { id: "user-a" };
  });

  it("preserves trusted pseudonym and sync retry state through transient auth loading", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <AnalyticsConsentProvider
        initialAccountSyncPending
        initialAnalyticsPseudonym="trusted-pseudonym"
        initialConsent={acceptedConsent}
        initialResolvedForSubject="user-a"
      >
        <ConsentState />
      </AnalyticsConsentProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("false");
    expect(mocks.resetAnalytics).not.toHaveBeenCalled();

    mocks.auth.isLoading = false;
    view.rerender(
      <AnalyticsConsentProvider
        initialAccountSyncPending
        initialAnalyticsPseudonym="trusted-pseudonym"
        initialConsent={acceptedConsent}
        initialResolvedForSubject="user-a"
      >
        <ConsentState />
      </AnalyticsConsentProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("true");
    expect(screen.getByTestId("pseudonym").textContent).toBe(
      "trusted-pseudonym"
    );
    expect(screen.getByTestId("sync-pending").textContent).toBe("true");
    expect(mocks.resetAnalytics).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

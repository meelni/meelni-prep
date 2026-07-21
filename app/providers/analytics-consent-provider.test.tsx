// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
      <span data-testid="decision">{state.decision}</span>
      <span data-testid="error">{state.error ?? "none"}</span>
      <button onClick={() => void state.setConsent("accepted", "settings")}>
        Accept
      </button>
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

  it("applies an authoritative decline when a stale acceptance conflicts", async () => {
    mocks.auth.isLoading = false;
    const accountDecline = {
      decision: "declined" as const,
      policyVersion: 1,
      source: "settings" as const,
      decidedAt: "2026-07-10T12:01:00.000Z",
      scope: "account" as const,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "consent_conflict",
          analyticsPseudonym: null,
          consent: accountDecline,
          persistence: {
            account: true,
            accountRevision: 2,
            browserOnly: false,
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetch);

    render(
      <AnalyticsConsentProvider
        initialAccountRevision={1}
        initialAnalyticsPseudonym="trusted-pseudonym"
        initialConsent={acceptedConsent}
        initialResolvedForSubject="user-a"
      >
        <ConsentState />
      </AnalyticsConsentProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(screen.getByTestId("decision").textContent).toBe("declined");
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      decision: "accepted",
      expectedRevision: 1,
    });
    expect(mocks.resetAnalytics).toHaveBeenCalled();
    expect(mocks.clearStatsigAnonymousIdentifiers).toHaveBeenCalled();
    expect(screen.getByTestId("error").textContent).toContain(
      "changed elsewhere"
    );
  });

  it("turns analytics off and refreshes after a policy-version conflict", async () => {
    mocks.auth.isLoading = false;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "consent_policy_outdated",
            currentPolicyVersion: 2,
          }),
          { status: 409, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            analyticsPseudonym: "trusted-pseudonym",
            consent: {
              decision: "undecided",
              policyVersion: null,
              source: null,
              decidedAt: null,
              scope: null,
            },
            persistence: {
              account: true,
              accountRevision: 1,
              browserOnly: false,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetch);

    render(
      <AnalyticsConsentProvider
        initialAccountRevision={1}
        initialAnalyticsPseudonym="trusted-pseudonym"
        initialConsent={acceptedConsent}
        initialResolvedForSubject="user-a"
      >
        <ConsentState />
      </AnalyticsConsentProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("decision").textContent).toBe("undecided");
    });
    expect(fetch.mock.calls[0][1].method).toBe("PUT");
    expect(fetch.mock.calls[1][1]).toEqual({ cache: "no-store" });
    expect(screen.getByTestId("pseudonym").textContent).toBe("none");
    expect(mocks.resetAnalytics).toHaveBeenCalled();
    expect(mocks.clearStatsigAnonymousIdentifiers).toHaveBeenCalled();
  });
});

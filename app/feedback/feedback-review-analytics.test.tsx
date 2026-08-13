// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consent: {
    consent: { decidedAt: "2026-08-12T12:00:00.000Z" },
    decision: "accepted" as "undecided" | "accepted" | "declined",
    resolved: true,
    resolvedForUserId: "synthetic-user-a" as string | null,
  },
  runtimeReady: false,
  track: vi.fn(),
}));

vi.mock("@/app/providers/analytics-consent-provider", () => ({
  useAnalyticsConsent: () => mocks.consent,
}));
vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: mocks.track },
}));
vi.mock("@/lib/analytics/posthog-provider", () => ({
  usePostHogRuntimeReady: () => mocks.runtimeReady,
}));

import { FeedbackReviewAnalytics } from "@/components/feedback/feedback-review-analytics";

describe("FeedbackReviewAnalytics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.runtimeReady = false;
    mocks.consent.consent.decidedAt = "2026-08-12T12:00:00.000Z";
    mocks.consent.decision = "accepted";
    mocks.consent.resolved = true;
    mocks.consent.resolvedForUserId = "synthetic-user-a";
  });

  it("emits once when consent predates the mount and the runtime becomes ready", () => {
    const view = render(
      <FeedbackReviewAnalytics outcome="partial_scorecard" />
    );
    expect(mocks.track).not.toHaveBeenCalled();

    mocks.runtimeReady = true;
    view.rerender(<FeedbackReviewAnalytics outcome="partial_scorecard" />);
    view.rerender(<FeedbackReviewAnalytics outcome="partial_scorecard" />);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("feedback_viewed", {
      outcome: "partial_scorecard",
    });
  });

  it("does not emit retroactively after consent is granted later", () => {
    mocks.consent.decision = "undecided";
    const view = render(<FeedbackReviewAnalytics outcome="full_scorecard" />);

    mocks.consent.decision = "accepted";
    mocks.consent.consent.decidedAt = "2020-01-01T00:00:00.000Z";
    mocks.runtimeReady = true;
    view.rerender(<FeedbackReviewAnalytics outcome="full_scorecard" />);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("does not replay a view after initially unresolved consent resolves", () => {
    mocks.consent.resolved = false;
    mocks.consent.resolvedForUserId = null;
    const view = render(<FeedbackReviewAnalytics outcome="full_scorecard" />);

    mocks.consent.resolved = true;
    mocks.consent.resolvedForUserId = "synthetic-user-a";
    mocks.runtimeReady = true;
    view.rerender(<FeedbackReviewAnalytics outcome="full_scorecard" />);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("drops a pending event after withdrawal or account switch", () => {
    const withdrawn = render(
      <FeedbackReviewAnalytics outcome="coaching_review" />
    );
    mocks.consent.decision = "declined";
    mocks.runtimeReady = true;
    withdrawn.rerender(<FeedbackReviewAnalytics outcome="coaching_review" />);
    expect(mocks.track).not.toHaveBeenCalled();
    withdrawn.unmount();

    mocks.runtimeReady = false;
    mocks.consent.decision = "accepted";
    mocks.consent.resolvedForUserId = "synthetic-user-a";
    const switched = render(
      <FeedbackReviewAnalytics outcome="coaching_review" />
    );
    mocks.consent.resolvedForUserId = "synthetic-user-b";
    mocks.runtimeReady = true;
    switched.rerender(<FeedbackReviewAnalytics outcome="coaching_review" />);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

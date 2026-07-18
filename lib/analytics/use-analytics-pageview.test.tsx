// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pageview: vi.fn(),
  pathname: "/dashboard",
  runtimeReady: false,
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("./analytics-service", () => ({
  analytics: { pageview: mocks.pageview },
}));
vi.mock("./posthog-provider", () => ({
  usePostHogRuntimeReady: () => mocks.runtimeReady,
}));

import { useAnalyticsPageview } from "./use-analytics-pageview";

function Tracker() {
  useAnalyticsPageview();
  return null;
}

describe("useAnalyticsPageview", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.pathname = "/dashboard";
    mocks.runtimeReady = false;
    mocks.searchParams = new URLSearchParams();
  });

  it("delivers the current page once the consented PostHog runtime is ready", () => {
    const view = render(<Tracker />);
    expect(mocks.pageview).not.toHaveBeenCalled();

    mocks.runtimeReady = true;
    view.rerender(<Tracker />);
    expect(mocks.pageview).toHaveBeenCalledTimes(1);
    expect(mocks.pageview).toHaveBeenLastCalledWith("/dashboard");

    mocks.pathname = "/pricing";
    view.rerender(<Tracker />);
    expect(mocks.pageview).toHaveBeenCalledTimes(2);
    expect(mocks.pageview).toHaveBeenLastCalledWith("/pricing");
  });
});

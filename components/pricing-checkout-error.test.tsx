// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PricingPage from "@/app/pricing/page";
import { Pricing } from "@/components/sections/pricing";

vi.mock("@/components/sections/header", () => ({
  Header: () => null,
}));

vi.mock("@/lib/feature-flags/public-activation-client", () => ({
  usePublicActivationDecision: () => ({
    canActivate: true,
    state: "available",
  }),
}));

describe("pricing checkout failures", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["homepage pricing section", <Pricing key="homepage" />],
    ["full pricing page", <PricingPage key="page" />],
  ])("shows a retryable error on the %s", async (_name, surface) => {
    const user = userEvent.setup();
    render(surface);

    const checkoutButton = screen.getByRole("button", {
      name: "Get 1 credit",
    });
    await user.click(checkoutButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Checkout couldn’t start. Please try again. If the problem continues, contact support."
    );
    expect(checkoutButton).toBeEnabled();
  });
});

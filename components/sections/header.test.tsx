// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "./header";

const state = vi.hoisted(() => ({
  canActivate: false,
  user: null as null | { id: string },
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: state.user }),
}));
vi.mock("@/lib/feature-flags/public-activation-client", () => ({
  usePublicActivationDecision: () => ({
    canActivate: state.canActivate,
    state: state.canActivate ? "available" : "paused",
  }),
}));
vi.mock("@/components/feature-flags/feature-flag-dev-menu", () => ({
  FeatureFlagDevMenu: () => null,
}));
vi.mock("@/components/mobile-drawer", () => ({ MobileDrawer: () => null }));
vi.mock("@/components/icons", () => ({
  Icons: { logo: () => <span aria-hidden="true" /> },
}));

describe("Header account navigation", () => {
  beforeEach(() => {
    state.canActivate = false;
    state.user = null;
  });

  afterEach(cleanup);

  it("keeps Log In available while new practice is paused", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(
      screen.getByRole("button", { name: "Practice currently paused" })
    ).toBeDisabled();
  });

  it("keeps Dashboard access available to signed-in users while paused", () => {
    state.user = { id: "user-1" };
    render(<Header />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.queryByRole("link", { name: "Log In" })).toBeNull();
  });
});

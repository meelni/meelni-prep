// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileDrawer } from "./mobile-drawer";

const state = vi.hoisted(() => ({
  canActivate: false,
  isLoading: false,
  user: null as null | {
    id: string;
    email?: string;
    user_metadata?: { full_name?: string };
  },
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: state.user, isLoading: state.isLoading }),
}));
vi.mock("@/lib/feature-flags/public-activation-client", () => ({
  usePublicActivationDecision: () => ({
    canActivate: state.canActivate,
    state: state.canActivate ? "available" : "paused",
  }),
}));
vi.mock("@/components/icons", () => ({
  Icons: { logo: () => <span aria-hidden="true" /> },
}));
vi.mock("@/components/ui/navigation-drawer", () => {
  function Container({ children }: { children: ReactNode }) {
    return <div>{children}</div>;
  }

  function Passthrough({ children }: { children: ReactNode }) {
    return children;
  }

  return {
    NavigationDrawer: Container,
    NavigationDrawerBody: Container,
    NavigationDrawerClose: Passthrough,
    NavigationDrawerContent: Container,
    NavigationDrawerDescription: Container,
    NavigationDrawerFooter: Container,
    NavigationDrawerHeader: Container,
    NavigationDrawerTitle: Container,
    NavigationDrawerTrigger: Passthrough,
  };
});

describe("MobileDrawer account navigation", () => {
  beforeEach(() => {
    state.canActivate = false;
    state.isLoading = false;
    state.user = null;
  });

  afterEach(cleanup);

  it("keeps Log In available while new practice is paused", () => {
    render(<MobileDrawer />);

    expect(
      screen.getByRole("button", { name: "Open navigation menu" })
    ).not.toHaveAttribute("aria-controls");
    expect(
      screen.getByRole("button", { name: "Open navigation menu" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(
      screen.getByRole("button", { name: "Practice currently paused" })
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: /Contact/ })).toHaveAttribute(
      "href",
      "/contact"
    );
  });

  it("keeps Dashboard access available to signed-in users while paused", () => {
    state.user = {
      id: "user-1",
      email: "candidate@example.com",
      user_metadata: { full_name: "Candidate Person" },
    };
    render(<MobileDrawer />);

    expect(
      screen.getByRole("link", { name: "Go to Dashboard" })
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Log In" })).toBeNull();
  });
});

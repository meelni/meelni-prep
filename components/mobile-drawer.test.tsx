// @vitest-environment jsdom

import React, { type ComponentPropsWithoutRef, type ReactNode } from "react";
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
vi.mock("@/components/ui/drawer", () => {
  function Container({ children }: { children: ReactNode }) {
    return <div>{children}</div>;
  }

  function Trigger({ children, ...props }: ComponentPropsWithoutRef<"button">) {
    return <button {...props}>{children}</button>;
  }

  return {
    Drawer: Container,
    DrawerContent: Container,
    DrawerDescription: Container,
    DrawerFooter: Container,
    DrawerHeader: Container,
    DrawerTitle: Container,
    DrawerTrigger: Trigger,
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

    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(
      screen.getByRole("button", { name: "Practice currently paused" })
    ).toBeDisabled();
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

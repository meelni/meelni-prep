// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";
import SignInPage from "./signin/page";
import SignUpPage from "./signup/page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  resetPassword: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUpWithEmail: vi.fn(),
  updateUser: vi.fn(),
  searchParams: new URLSearchParams(),
  canActivate: true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    isLoading: false,
    resetPassword: mocks.resetPassword,
    signInWithEmail: mocks.signInWithEmail,
    signInWithGoogle: mocks.signInWithGoogle,
    signUpWithEmail: mocks.signUpWithEmail,
    user: null,
  }),
}));

vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: vi.fn() },
}));

vi.mock("@/lib/feature-flags/public-activation-client", () => ({
  usePublicActivationDecision: () => ({
    canActivate: mocks.canActivate,
    state: mocks.canActivate ? "available" : "paused",
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: mocks.updateUser } }),
}));

const selectedQuestionHandoff = new URLSearchParams({
  redirectTo:
    "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe",
  cancelTo: "/explore?company=Stripe",
});

describe("rendered auth intent and recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canActivate = true;
    mocks.searchParams = new URLSearchParams(selectedQuestionHandoff);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("preserves independently safe success and cancel destinations through sign-in recovery navigation", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    const recovery = new URL(
      mocks.push.mock.calls[0][0],
      "https://meelni.test"
    );
    expect(recovery.pathname).toBe("/auth/forgot-password");
    expect(recovery.searchParams.get("redirectTo")).toContain(
      "questionId=question-1"
    );
    expect(recovery.searchParams.get("cancelTo")).toBe(
      "/explore?company=Stripe"
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/explore?company=Stripe");
  });

  it("normalizes malicious success and cancel destinations independently in rendered navigation", async () => {
    mocks.searchParams = new URLSearchParams({
      redirectTo: "https://evil.example/account",
      cancelTo: "//evil.example",
    });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    const recovery = new URL(
      mocks.push.mock.calls[0][0],
      "https://meelni.test"
    );
    expect(recovery.searchParams.get("redirectTo")).toBe("/dashboard");
    expect(recovery.searchParams.get("cancelTo")).toBe("/");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/");
  });

  it("keeps existing sign-in available without exposing signup activation while paused", () => {
    mocks.canActivate = false;
    render(<SignInPage />);

    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Continue with Google" })
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Sign up" })).toBeNull();
    expect(
      screen.getByText("New accounts currently paused")
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/auth/signup")
    );
  });

  it("makes the direct signup route inert while paused and retains existing-account entry", async () => {
    mocks.canActivate = false;
    const user = userEvent.setup();
    render(<SignUpPage />);

    expect(
      screen.getByRole("heading", { name: "New accounts currently paused" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Practice currently paused"
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Sign in to an existing account" })
    );
    expect(mocks.push).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signin")
    );
    expect(mocks.signUpWithEmail).not.toHaveBeenCalled();
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("carries selected-question intent into password recovery and exposes a retryable failure", async () => {
    mocks.resetPassword.mockRejectedValueOnce(new Error("Email unavailable"));
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "pm@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email unavailable"
    );
    expect(
      screen.getByRole("button", { name: "Send Reset Link" })
    ).toBeEnabled();
    expect(mocks.resetPassword).toHaveBeenCalledWith("pm@example.com", {
      redirectTo:
        "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe",
      cancelTo: "/explore?company=Stripe",
    });
  });

  it("links signup to the clearly labeled legal drafts without claiming acceptance", () => {
    render(<SignUpPage />);

    expect(screen.getByRole("link", { name: "Terms draft" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByText(/Review the.*before creating an account/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/you agree/i)).toBeNull();
  });

  it("associates a password mismatch with both affected password inputs", async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);

    await user.type(screen.getByLabelText("Email"), "pm@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.type(
      screen.getByLabelText("Confirm Password"),
      "different-horse"
    );
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Passwords do not match");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      alert.id
    );
    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute(
      "aria-describedby",
      alert.id
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("associates a minimum-length error with the password input only", async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);

    await user.type(screen.getByLabelText("Email"), "pm@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Password must be at least 8 characters long"
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      alert.id
    );
    expect(screen.getByLabelText("Confirm Password")).not.toHaveAttribute(
      "aria-invalid"
    );
    expect(screen.getByLabelText("Confirm Password")).not.toHaveAttribute(
      "aria-describedby"
    );
  });

  it("returns to the selected question after a successful password update", async () => {
    vi.useFakeTimers();
    mocks.updateUser.mockResolvedValueOnce({ error: null });
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "correct-horse" },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Update Password" }).closest("form")!
      );
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Password updated!");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe"
    );
  });
});

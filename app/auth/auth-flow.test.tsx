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
    expect(screen.getByRole("link", { name: "Privacy draft" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(
      screen.getByText(/Review the.*before creating an account/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/you agree/i)).toBeNull();
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

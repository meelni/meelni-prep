// @vitest-environment jsdom

import React, { useRef, useState } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionSignInModal } from "./question-signin-modal";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("company=Stripe&page=2"),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ signInWithGoogle: mocks.signInWithGoogle }),
}));

function ModalHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Choose question
      </button>
      <QuestionSignInModal
        isOpen={open}
        onClose={() => setOpen(false)}
        questionId="question-1"
        questionText="How would you improve Stripe Checkout?"
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe("QuestionSignInModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("opens with contained focus, hides the decorative Google mark, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole("button", { name: "Choose question" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Ready to practice?",
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("img")).toBeNull();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("recovers from Google initiation failure without losing selected-question intent", async () => {
    mocks.signInWithGoogle.mockRejectedValueOnce(new Error("popup blocked"));
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Choose question" }));
    const googleButton = await screen.findByRole("button", {
      name: "Continue with Google",
    });
    await user.click(googleButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in could not start. Please try again."
    );
    expect(googleButton).toBeEnabled();
    expect(mocks.signInWithGoogle).toHaveBeenCalledWith({
      redirectTo:
        "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe%26page%3D2",
      cancelTo: "/explore?company=Stripe&page=2",
    });
  });

  it("renders reduced-motion overrides on the shared dialog overlay and content", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Choose question" }));
    const dialog = await screen.findByRole("dialog");
    const overlay = dialog.previousElementSibling;

    expect(overlay).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none"
    );
    expect(dialog).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
      "motion-reduce:duration-0"
    );
  });
});

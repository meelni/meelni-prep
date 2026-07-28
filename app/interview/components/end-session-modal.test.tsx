// @vitest-environment jsdom

import React, { useRef, useState } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EndSessionModal } from "./end-session-modal";

function ModalHarness({
  isLoading = false,
  terminalIntent = false,
}: {
  isLoading?: boolean;
  terminalIntent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        End interview
      </button>
      <EndSessionModal
        isOpen={open}
        isLoading={isLoading}
        error={
          terminalIntent
            ? "Your interview is paused. Please try End Interview again."
            : null
        }
        terminalIntent={terminalIntent}
        capturedAnswerCount={2}
        onClose={() => setOpen(false)}
        onConfirm={vi.fn()}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe("EndSessionModal", () => {
  afterEach(() => cleanup());

  it("focuses the safe action, closes on Escape, and restores its trigger", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole("button", { name: "End interview" });
    await user.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "End interview?" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 candidate answers are visible/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue interview" })
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("keeps the committed end action open when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<ModalHarness isLoading />);

    await user.click(screen.getByRole("button", { name: "End interview" }));
    const dialog = await screen.findByRole("dialog", {
      name: "End interview?",
    });
    await user.keyboard("{Escape}");

    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ending..." })).toBeDisabled();
  });

  it("cannot resume or dismiss after the server has accepted terminal intent", async () => {
    const user = userEvent.setup();
    render(<ModalHarness terminalIntent />);

    await user.click(screen.getByRole("button", { name: "End interview" }));
    const dialog = await screen.findByRole("dialog", {
      name: "End interview?",
    });

    expect(
      screen.queryByRole("button", { name: "Continue interview" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/interview is paused/i);

    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
  });
});

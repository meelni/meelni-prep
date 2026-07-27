// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeSetDialog } from "./practice-set-dialog";

describe("PracticeSetDialog", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the dialog open when adding a selected question fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ set: { id: "set-1" } }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PracticeSetDialog
        isOpen
        onClose={onClose}
        selectedQuestionIds={["question-1", "question-2"]}
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByLabelText(/Name/), "Product strategy");
    await user.click(screen.getByRole("button", { name: "Create Set" }));

    expect(
      await screen.findByText(
        "Failed to create practice set. Please try again."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("signals success only after every selected question is added", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ set: { id: "set-1" } }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PracticeSetDialog
        isOpen
        onClose={onClose}
        selectedQuestionIds={["question-1", "question-2"]}
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByLabelText(/Name/), "Product strategy");
    await user.click(screen.getByRole("button", { name: "Create Set" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

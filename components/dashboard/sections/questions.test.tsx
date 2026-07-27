// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionsSection } from "./questions";

describe("QuestionsSection bookmarks", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rolls back an optimistic bookmark when the API rejects it", async () => {
    let resolveBookmark: ((value: { ok: boolean }) => void) | undefined;
    const bookmarkResponse = new Promise<{ ok: boolean }>((resolve) => {
      resolveBookmark = resolve;
    });
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/questions?")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              questions: [
                {
                  id: "question-1",
                  company: "Acme",
                  questionText: "How would you improve onboarding?",
                  questionType: "product_sense",
                  askedAt: "2026-07-01T00:00:00.000Z",
                  isActive: true,
                },
              ],
              pagination: { total: 1 },
            }),
          });
        }
        if (url === "/api/questions/bookmark" && !init?.method) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ questionIds: [] }),
          });
        }
        if (url === "/api/questions/bookmark" && init?.method === "POST") {
          return bookmarkResponse;
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<QuestionsSection />);

    const saveButton = await screen.findByRole("button", {
      name: "Save question",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(
      screen.getByRole("button", { name: "Remove saved question" })
    ).toBeDisabled();

    resolveBookmark?.({ ok: false });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save question" })
      ).toBeEnabled()
    );
    expect(
      screen.getByRole("button", { name: "Save question" })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That saved-question change didn’t stick. Please try again."
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error toggling bookmark:",
      expect.any(Error)
    );
  });

  it("waits for the initial saved list before enabling bookmark changes", async () => {
    let resolveBookmarks:
      | ((value: {
          ok: boolean;
          json: () => Promise<{ questionIds: string[] }>;
        }) => void)
      | undefined;
    const bookmarksResponse = new Promise<{
      ok: boolean;
      json: () => Promise<{ questionIds: string[] }>;
    }>((resolve) => {
      resolveBookmarks = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/questions?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            questions: [
              {
                id: "question-1",
                company: "Acme",
                questionText: "How would you improve onboarding?",
                questionType: "product_sense",
                askedAt: "2026-07-01T00:00:00.000Z",
                isActive: true,
              },
            ],
            pagination: { total: 1 },
          }),
        });
      }
      if (url === "/api/questions/bookmark") {
        return bookmarksResponse;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuestionsSection />);

    const saveButton = await screen.findByRole("button", {
      name: "Save question",
    });
    expect(saveButton).toBeDisabled();

    resolveBookmarks?.({
      ok: true,
      json: async () => ({ questionIds: [] }),
    });

    await waitFor(() => expect(saveButton).toBeEnabled());
  });

  it("allows only one bookmark mutation per question at a time", async () => {
    let resolveBookmark: ((value: { ok: boolean }) => void) | undefined;
    const bookmarkResponse = new Promise<{ ok: boolean }>((resolve) => {
      resolveBookmark = resolve;
    });
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/questions?")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              questions: [
                {
                  id: "question-1",
                  company: "Acme",
                  questionText: "How would you improve onboarding?",
                  questionType: "product_sense",
                  askedAt: "2026-07-01T00:00:00.000Z",
                  isActive: true,
                },
              ],
              pagination: { total: 1 },
            }),
          });
        }
        if (url === "/api/questions/bookmark" && !init?.method) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ questionIds: [] }),
          });
        }
        if (url === "/api/questions/bookmark" && init?.method === "POST") {
          return bookmarkResponse;
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<QuestionsSection />);

    const saveButton = await screen.findByRole("button", {
      name: "Save question",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    const pendingButton = screen.getByRole("button", {
      name: "Remove saved question",
    });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === "/api/questions/bookmark" &&
          (init as RequestInit | undefined)?.method === "POST"
      )
    ).toHaveLength(1);

    resolveBookmark?.({ ok: true });
    await waitFor(() => expect(pendingButton).toBeEnabled());
  });

  it("distinguishes a failed bookmark load from an empty saved list", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/questions?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            questions: [
              {
                id: "question-1",
                company: "Acme",
                questionText: "How would you improve onboarding?",
                questionType: "product_sense",
                askedAt: "2026-07-01T00:00:00.000Z",
                isActive: true,
              },
            ],
            pagination: { total: 1 },
          }),
        });
      }
      if (url === "/api/questions/bookmark") {
        return Promise.resolve({ ok: false });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuestionsSection />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved questions could not be loaded. You can still browse the question bank."
    );
    expect(
      screen.getAllByText("How would you improve onboarding?")
    ).toHaveLength(2);
  });
});

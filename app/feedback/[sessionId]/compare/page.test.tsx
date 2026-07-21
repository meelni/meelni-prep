// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const mocks = vi.hoisted(() => ({
  authLoading: false,
  push: vi.fn(),
  user: { id: "synthetic-owner" } as { id: string } | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ sessionId: SESSION_ID }),
  useRouter: () => mocks,
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user, isLoading: mocks.authLoading }),
}));

vi.mock("@/components/feedback/attempt-comparison", () => ({
  AttemptComparison: ({
    comparison,
  }: {
    comparison: { session1: { id: string } };
  }) => <div>Comparison {comparison.session1.id}</div>,
}));

import ComparePage from "./page";

function attempt(id: string, startedAt: string) {
  return {
    id,
    startedAt,
    endedAt: "2099-01-01T00:30:00.000Z",
    roundType: "product_sense",
    mode: "practice",
    overallScore: null,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
  };
}

describe("feedback comparison accessibility", () => {
  beforeEach(() => {
    mocks.authLoading = false;
    mocks.user = { id: "synthetic-owner" };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a busy status with a decorative reduced-motion spinner", () => {
    mocks.authLoading = true;

    const { container } = render(<ComparePage />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    const spinner = container.querySelector(".motion-reduce\\:animate-none");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no-attempt actions as sibling links instead of nested controls", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        attempts: [attempt(SESSION_ID, "2099-01-01T00:00:00.000Z")],
        roundType: "product_sense",
      })
    );

    const { container } = render(<ComparePage />);

    expect(
      await screen.findByRole("link", { name: "Start Another Interview" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View Feedback" })).toBeVisible();
    expect(container.querySelector("a button, button a")).toBeNull();
  });

  it("exposes earlier attempts as radios and the fixed latest attempt as static content", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        attempts: [
          attempt(
            "550e8400-e29b-41d4-a716-446655440001",
            "2098-12-01T00:00:00.000Z"
          ),
          attempt(SESSION_ID, "2099-01-01T00:00:00.000Z"),
        ],
        roundType: "product_sense",
      })
    );

    render(<ComparePage />);

    expect(
      await screen.findByRole("radiogroup", { name: "Earlier Attempt" })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("region", { name: "Latest Attempt" })
    ).toBeInTheDocument();
    expect(screen.getByText("Latest Session").closest("button")).toBeNull();
  });

  it("uses the newest returned session as latest even from an older feedback route", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        attempts: [
          {
            ...attempt(
              "550e8400-e29b-41d4-a716-446655440009",
              "2099-01-01T00:00:00.000Z"
            ),
            overallScore: 9,
          },
          {
            ...attempt(SESSION_ID, "2098-12-01T00:00:00.000Z"),
            overallScore: 4,
          },
        ],
        roundType: "product_sense",
      })
    );

    render(<ComparePage />);

    const latest = await screen.findByRole("region", {
      name: "Latest Attempt",
    });
    expect(within(latest).getByText("9/10")).toBeInTheDocument();
    expect(within(latest).getByText("Latest Session")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveTextContent("4/10");
  });

  it("excludes an unstarted attempt from latest and earlier choices", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        attempts: [
          attempt("550e8400-e29b-41d4-a716-446655440099", ""),
          {
            ...attempt(
              "550e8400-e29b-41d4-a716-446655440009",
              "2099-01-01T00:00:00.000Z"
            ),
            overallScore: 9,
          },
          {
            ...attempt(SESSION_ID, "2098-12-01T00:00:00.000Z"),
            overallScore: 4,
          },
        ],
        roundType: "product_sense",
      })
    );

    render(<ComparePage />);

    const latest = await screen.findByRole("region", {
      name: "Latest Attempt",
    });
    expect(within(latest).getByText("9/10")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByText("Invalid Date")).toBeNull();
  });

  it("supports arrow-key movement within the earlier-attempt radio group", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/attempts")) {
        return Response.json({
          attempts: [
            attempt(
              "550e8400-e29b-41d4-a716-446655440001",
              "2098-11-01T00:00:00.000Z"
            ),
            attempt(
              "550e8400-e29b-41d4-a716-446655440002",
              "2098-12-01T00:00:00.000Z"
            ),
            attempt(SESSION_ID, "2099-01-01T00:00:00.000Z"),
          ],
          roundType: "product_sense",
        });
      }
      return Response.json({ comparison: null });
    });

    render(<ComparePage />);

    const radios = await screen.findAllByRole("radio");
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");
    fireEvent.click(radios[0]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
    expect(radios[1]).toHaveAttribute("tabindex", "0");
  });

  it("ignores an older comparison response after the radio selection moves", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    let comparisonCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/attempts")) {
        return Response.json({
          attempts: [
            attempt(
              "550e8400-e29b-41d4-a716-446655440001",
              "2098-11-01T00:00:00.000Z"
            ),
            attempt(
              "550e8400-e29b-41d4-a716-446655440002",
              "2098-12-01T00:00:00.000Z"
            ),
            attempt(SESSION_ID, "2099-01-01T00:00:00.000Z"),
          ],
          roundType: "product_sense",
        });
      }
      comparisonCalls += 1;
      return comparisonCalls === 1 ? first : second;
    });

    render(<ComparePage />);
    const radios = await screen.findAllByRole("radio");
    fireEvent.click(radios[0]);
    await waitFor(() => expect(comparisonCalls).toBe(1));
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    await waitFor(() => expect(comparisonCalls).toBe(2));

    await act(async () => {
      resolveSecond(
        Response.json({ comparison: { session1: { id: "newer-choice" } } })
      );
    });
    expect(await screen.findByText("Comparison newer-choice")).toBeVisible();

    await act(async () => {
      resolveFirst(
        Response.json({ comparison: { session1: { id: "stale-choice" } } })
      );
    });
    expect(screen.getByText("Comparison newer-choice")).toBeVisible();
    expect(screen.queryByText("Comparison stale-choice")).toBeNull();
  });

  it("renders an owned retry state when comparison loading fails", async () => {
    let comparisonCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/attempts")) {
        return Response.json({
          attempts: [
            attempt(
              "550e8400-e29b-41d4-a716-446655440001",
              "2098-12-01T00:00:00.000Z"
            ),
            attempt(SESSION_ID, "2099-01-01T00:00:00.000Z"),
          ],
          roundType: "product_sense",
        });
      }
      comparisonCalls += 1;
      return comparisonCalls === 1
        ? Response.json({}, { status: 503 })
        : Response.json({
            comparison: { session1: { id: "retry-success" } },
          });
    });

    render(<ComparePage />);
    fireEvent.click(await screen.findByRole("radio"));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Comparison Unavailable")
    ).toBeInTheDocument();
    expect(
      within(alert).getByText("We could not load this comparison.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Comparison" }));
    expect(await screen.findByText("Comparison retry-success")).toBeVisible();
  });
});

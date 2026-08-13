// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FeedbackQualityControl,
  parseOwnedState,
} from "@/components/feedback/feedback-quality-control";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("FeedbackQualityControl", () => {
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
  });

  it("hydrates an eligible review and saves one optional closed reason", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, ownedState(null)))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          disposition: "created",
          ...ownedState(
            signal({
              response: "not_helpful",
              reason: "next_step_unclear",
            })
          ),
        })
      );

    render(
      <FeedbackQualityControl
        sessionId="synthetic-session"
        outcome="partial_scorecard"
      />
    );

    const notHelpful = await screen.findByRole("button", {
      name: "Not helpful",
    });
    expect(notHelpful.classList.contains("min-h-11")).toBe(true);
    fireEvent.click(notHelpful);
    expect(
      screen.getByRole("group", { name: /What could be better/ })
    ).not.toBeNull();
    fireEvent.click(screen.getByLabelText("The next step was unclear"));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await screen.findByText("Response saved.");
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      contractVersion: "feedback-quality-signal.v1",
      response: "not_helpful",
      reason: "next_step_unclear",
      expectedRevision: null,
    });
    expect(
      screen
        .getByRole("button", { name: "Not helpful" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("keeps the local draft and retries against the authoritative conflict revision", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, ownedState(signal({ response: "helpful" })))
      )
      .mockResolvedValueOnce(
        jsonResponse(409, {
          error: "feedback_quality_conflict",
          ...ownedState(signal({ response: "helpful", revision: 2 })),
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          disposition: "updated",
          ...ownedState(
            signal({
              response: "not_helpful",
              reason: null,
              revision: 3,
            })
          ),
        })
      );

    render(
      <FeedbackQualityControl
        sessionId="synthetic-session"
        outcome="partial_scorecard"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Not helpful" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("button", { name: "Not helpful" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await screen.findByText("Response updated.");
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    ).toMatchObject({
      expectedRevision: 2,
      response: "not_helpful",
      reason: null,
    });
  });

  it("hides an API-ineligible review and uses the coaching-only reason", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));
    const view = render(
      <FeedbackQualityControl
        sessionId="synthetic-session"
        outcome="coaching_review"
      />
    );
    await waitFor(() =>
      expect(view.queryByText("Did this review help?")).toBeNull()
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, ownedState(null, "coaching_review"))
    );
    view.rerender(
      <FeedbackQualityControl
        sessionId="synthetic-session-2"
        outcome="coaching_review"
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Not helpful" }));
    expect(
      screen.getByLabelText("Why scores were withheld was unclear")
    ).not.toBeNull();
    expect(
      screen.queryByLabelText("The score explanation was unclear")
    ).toBeNull();
  });

  it("rejects identifier-bearing or malformed hydration payloads", () => {
    expect(parseOwnedState({ ...ownedState(null), sessionId: "private" })).toBe(
      null
    );
    expect(
      parseOwnedState({
        outcome: "unable_to_review",
        signal: null,
      })
    ).toBe(null);
    expect(
      parseOwnedState({
        outcome: "full_scorecard",
        signal: signal({
          outcome: "coaching_review",
          response: "helpful",
        }),
      })
    ).toBe(null);
  });
});

function ownedState(
  saved: ReturnType<typeof signal> | null,
  outcome:
    | "full_scorecard"
    | "partial_scorecard"
    | "coaching_review" = "partial_scorecard"
) {
  return { outcome, signal: saved };
}

function signal(
  overrides: Partial<{
    outcome: "full_scorecard" | "partial_scorecard" | "coaching_review";
    response: "helpful" | "not_helpful";
    reason: "next_step_unclear" | "score_withholding_unclear" | null;
    revision: number;
  }> = {}
) {
  return {
    contractVersion: "feedback-quality-signal.v1",
    outcome: overrides.outcome ?? "partial_scorecard",
    response: overrides.response ?? "helpful",
    reason: overrides.reason ?? null,
    revision: overrides.revision ?? 1,
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:00:00.000Z",
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

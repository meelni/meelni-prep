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
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ sessionId: navigation.sessionId }),
  useRouter: () => navigation,
}));

import FeedbackPage from "./page";

describe("feedback transcript read states", () => {
  beforeEach(() => {
    navigation.sessionId = SESSION_ID;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("distinguishes a failed transcript read from a successful empty transcript and supports retry", async () => {
    let transcriptAttempts = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return completedFeedbackResponse();
      }
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        transcriptAttempts += 1;
        return transcriptAttempts === 1
          ? Response.json(
              { error: "transcript_temporarily_unavailable" },
              { status: 503 }
            )
          : Response.json({ turns: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Transcript could not be loaded");
    expect(
      screen.queryByText("No transcript is available for this interview.")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry transcript" }));

    expect(
      await screen.findByText("No transcript is available for this interview.")
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(transcriptAttempts).toBe(2);
  });

  it("keeps a successful transcript read loading until turns are ready", async () => {
    let resolveTranscript: ((response: Response) => void) | undefined;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return completedFeedbackResponse();
      }
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        return new Promise<Response>((resolve) => {
          resolveTranscript = resolve;
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading transcript"
    );
    expect(
      screen.queryByText("No transcript is available for this interview.")
    ).not.toBeInTheDocument();
    expect(resolveTranscript).toBeDefined();

    await act(async () => {
      resolveTranscript?.(
        Response.json({
          turns: [
            {
              id: "turn-1",
              sessionId: SESSION_ID,
              speaker: "user",
              startedAt: "2099-07-15T21:00:00.000Z",
              endedAt: "2099-07-15T21:00:01.000Z",
              text: "Synthetic transcript fixture",
              audioMs: 1000,
              latencyMs: null,
              section: "answer",
            },
          ],
        })
      );
    });

    expect(
      await screen.findByText("Synthetic transcript fixture")
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a stale transcript response after the session changes", async () => {
    let resolveFirstTranscript: ((response: Response) => void) | undefined;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return completedFeedbackResponse(SESSION_ID);
      }
      if (url === `/api/feedback/${SECOND_SESSION_ID}`) {
        return completedFeedbackResponse(SECOND_SESSION_ID);
      }
      if (url === `/api/session/${SESSION_ID}/transcript`) {
        return new Promise<Response>((resolve) => {
          resolveFirstTranscript = resolve;
        });
      }
      if (url === `/api/session/${SECOND_SESSION_ID}/transcript`) {
        return transcriptResponse(SECOND_SESSION_ID, "Current session turn");
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    const view = render(<FeedbackPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading transcript"
    );
    expect(resolveFirstTranscript).toBeDefined();

    navigation.sessionId = SECOND_SESSION_ID;
    view.rerender(<FeedbackPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand" }));
    expect(await screen.findByText("Current session turn")).toBeInTheDocument();

    await act(async () => {
      resolveFirstTranscript?.(
        transcriptResponse(SESSION_ID, "Stale prior session turn")
      );
    });

    expect(screen.getByText("Current session turn")).toBeInTheDocument();
    expect(
      screen.queryByText("Stale prior session turn")
    ).not.toBeInTheDocument();
  });

  it("ignores a stale feedback response after the session changes", async () => {
    let resolveFirstFeedback: ((response: Response) => void) | undefined;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return new Promise<Response>((resolve) => {
          resolveFirstFeedback = resolve;
        });
      }
      if (url === `/api/feedback/${SECOND_SESSION_ID}`) {
        return completedFeedbackResponse(
          SECOND_SESSION_ID,
          "Current session summary"
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    const view = render(<FeedbackPage />);
    await waitFor(() => expect(resolveFirstFeedback).toBeDefined());

    navigation.sessionId = SECOND_SESSION_ID;
    view.rerender(<FeedbackPage />);
    expect(await screen.findByText("Current session summary")).toBeVisible();

    await act(async () => {
      resolveFirstFeedback?.(
        completedFeedbackResponse(SESSION_ID, "Stale prior session summary")
      );
    });

    expect(screen.getByText("Current session summary")).toBeVisible();
    expect(
      screen.queryByText("Stale prior session summary")
    ).not.toBeInTheDocument();
  });
});

function completedFeedbackResponse(
  sessionId = SESSION_ID,
  summary = "Synthetic fixture summary"
) {
  return Response.json({
    status: "completed",
    retryable: false,
    feedback: {
      kind: "v2",
      id: "feedback-1",
      sessionId,
      scores: {
        structure: 8,
        clarity: 8,
        insight: 8,
        communication: 8,
        leadership: 8,
        overall: 8,
      },
      strengths: [feedbackFinding("insight", "turn-1")],
      improvements: [feedbackFinding("structure", "turn-2")],
      summary,
      rubricVersion: "pm-feedback-rubric.v2",
      schemaVersion: "feedback.v2",
      promptVersion: "feedback.prompt.v2",
      modelVersion: "synthetic-fixture-model",
      evaluationState: "full",
      createdAt: "2099-07-15T21:00:00.000Z",
      nextPracticeRecommendation: null,
    },
  });
}

function feedbackFinding(dimension: "insight" | "structure", turnRef: string) {
  return {
    dimension,
    observation: `Synthetic ${dimension} observation`,
    transcriptRefs: [turnRef],
    evidence: [{ turnRef, quote: `Synthetic ${dimension} evidence` }],
    nextStep: `Synthetic ${dimension} next action`,
    rubricVersion: "pm-feedback-rubric.v2",
    confidence: 0.8,
  };
}

function transcriptResponse(sessionId: string, text: string) {
  return Response.json({
    turns: [
      {
        id: `turn-${sessionId}`,
        sessionId,
        speaker: "user",
        startedAt: "2099-07-15T21:00:00.000Z",
        endedAt: "2099-07-15T21:00:01.000Z",
        text,
        audioMs: 1000,
        latencyMs: null,
        section: "answer",
      },
    ],
  });
}

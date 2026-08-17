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

vi.mock("@/components/feedback/feedback-review-analytics", () => ({
  FeedbackReviewAnalytics: () => null,
}));

import FeedbackPage from "./page";

describe("feedback transcript read states", () => {
  beforeEach(() => {
    navigation.sessionId = SESSION_ID;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("continues bounded GET polling while settling without starting recovery", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let feedbackPostAttempts = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${url}`);
        }
        if (init?.method === "POST") {
          feedbackPostAttempts += 1;
          throw new Error("Settling must never trigger recovery");
        }
        feedbackGetAttempts += 1;
        return feedbackGetAttempts === 1
          ? Response.json({
              status: "settling",
              retryable: false,
              message: "The interview is saved while its room closes safely.",
            })
          : completedFeedbackResponse();
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await act(async () => undefined);

    expect(screen.getByText("Saving your interview")).toBeInTheDocument();
    expect(feedbackGetAttempts).toBe(1);
    expect(feedbackPostAttempts).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText("Synthetic fixture summary")).toBeInTheDocument();
    expect(feedbackGetAttempts).toBe(2);
    expect(feedbackPostAttempts).toBe(0);
  });

  it("retains the saved workspace across rolling-compatible poll responses", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${String(input)}`);
        }
        feedbackGetAttempts += 1;
        return Response.json({
          status: "processing",
          retryable: false,
          delayed: false,
          ...(feedbackGetAttempts === 1
            ? { workspace: savedInterviewWorkspace() }
            : {}),
        });
      })
    );

    render(<FeedbackPage />);
    await act(async () => undefined);

    expect(
      screen.getByRole("heading", {
        name: "How would you improve a synthetic planning product?",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand interview transcript" })
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(feedbackGetAttempts).toBe(2);
    expect(
      screen.getByRole("heading", {
        name: "How would you improve a synthetic planning product?",
      })
    ).toBeInTheDocument();
  });

  it("reauthenticates a feedback GET 401 with the exact feedback deep link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    render(<FeedbackPage />);

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/auth/signin?redirectTo=%2Ffeedback%2F${SESSION_ID}&cancelTo=%2F`
      )
    );
  });

  it("reauthenticates a feedback recovery POST 401 with the exact feedback deep link", async () => {
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests += 1;
        if (init?.method === "POST") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({
          status: "pending",
          retryable: true,
          delayed: true,
        });
      })
    );

    render(<FeedbackPage />);

    await waitFor(() => expect(requests).toBe(2));
    expect(navigation.replace).toHaveBeenCalledWith(
      `/auth/signin?redirectTo=%2Ffeedback%2F${SESSION_ID}&cancelTo=%2F`
    );
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("pauses honestly after exhausting the full automatic poll budget", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let feedbackPostAttempts = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${url}`);
        }
        if (init?.method === "POST") {
          feedbackPostAttempts += 1;
          throw new Error(
            "A non-retryable lifecycle must never trigger recovery"
          );
        }
        feedbackGetAttempts += 1;
        return Response.json({
          status: "processing",
          retryable: false,
          delayed: true,
        });
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await act(async () => undefined);

    expect(feedbackGetAttempts).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 3000);
    });

    expect(feedbackGetAttempts).toBe(31);
    expect(feedbackPostAttempts).toBe(0);
    expect(
      screen.getByRole("heading", { name: "Automatic checking paused" })
    ).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "false");
    expect(status.querySelector(".animate-spin")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Check again" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View interview history" })
    ).toHaveAttribute("href", "/dashboard/history");
  });

  it("checks once and renders late completion without a document reload", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let feedbackPostAttempts = 0;
    let resolveLateCompletion: ((response: Response) => void) | undefined;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${url}`);
        }
        if (init?.method === "POST") {
          feedbackPostAttempts += 1;
          throw new Error("Check again must remain read-only");
        }
        feedbackGetAttempts += 1;
        if (feedbackGetAttempts <= 31) return processingFeedbackResponse();
        return new Promise<Response>((resolve) => {
          resolveLateCompletion = resolve;
        });
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await exhaustAutomaticPollBudget();

    const checkAgain = screen.getByRole("button", { name: "Check again" });
    fireEvent.click(checkAgain);
    fireEvent.click(checkAgain);

    expect(feedbackGetAttempts).toBe(32);
    expect(feedbackPostAttempts).toBe(0);
    expect(resolveLateCompletion).toBeDefined();

    await act(async () => {
      resolveLateCompletion?.(completedFeedbackResponse());
    });

    expect(screen.getByText("Synthetic fixture summary")).toBeInTheDocument();
    expect(feedbackGetAttempts).toBe(32);
    expect(feedbackPostAttempts).toBe(0);
  });

  it("uses GET-only checking before exposing server-authorized POST recovery", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let feedbackPostAttempts = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${url}`);
        }
        if (init?.method === "POST") {
          feedbackPostAttempts += 1;
          return Response.json({ status: "completed" });
        }
        feedbackGetAttempts += 1;
        if (feedbackGetAttempts <= 31) return processingFeedbackResponse();
        if (feedbackGetAttempts === 32) {
          return Response.json({
            status: "pending",
            retryable: true,
            delayed: true,
          });
        }
        return completedFeedbackResponse();
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await exhaustAutomaticPollBudget();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => undefined);

    expect(feedbackGetAttempts).toBe(32);
    expect(feedbackPostAttempts).toBe(0);
    expect(
      screen.getByRole("button", { name: "Queue feedback" })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Queue feedback" }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("Synthetic fixture summary")).toBeVisible();
    expect(feedbackGetAttempts).toBe(33);
    expect(feedbackPostAttempts).toBe(1);
  });

  it("bounds a resumed automatic window after a failed check", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let feedbackPostAttempts = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `/api/feedback/${SESSION_ID}`) {
          throw new Error(`Unexpected request: ${url}`);
        }
        if (init?.method === "POST") {
          feedbackPostAttempts += 1;
          throw new Error("Transport refresh must never trigger recovery");
        }
        feedbackGetAttempts += 1;
        return feedbackGetAttempts <= 31
          ? processingFeedbackResponse()
          : Response.json(
              { error: "synthetic temporary outage" },
              { status: 503 }
            );
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await exhaustAutomaticPollBudget();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => undefined);

    expect(feedbackGetAttempts).toBe(32);
    expect(feedbackPostAttempts).toBe(0);
    expect(
      screen.getByText(/reconnecting to your saved interview/i)
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 3000);
    });

    expect(feedbackGetAttempts).toBe(62);
    expect(feedbackPostAttempts).toBe(0);
    expect(
      screen.getByRole("heading", { name: "Automatic checking paused" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("status")).toHaveTextContent(
      "automatic checking is paused"
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      /update automatically/i
    );
    expect(
      screen.getByRole("button", { name: "Check again" })
    ).toBeInTheDocument();
  });

  it("aborts an in-flight customer check when the feedback view unmounts", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    let customerCheckSignal: AbortSignal | undefined;
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        feedbackGetAttempts += 1;
        if (feedbackGetAttempts <= 31) return processingFeedbackResponse();
        customerCheckSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("customer check aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      }
    );
    vi.stubGlobal("fetch", request);

    const view = render(<FeedbackPage />);
    await exhaustAutomaticPollBudget();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => undefined);
    expect(customerCheckSignal).toBeDefined();

    view.unmount();

    expect(customerCheckSignal?.aborted).toBe(true);
    expect(feedbackGetAttempts).toBe(32);
  });

  it("links an active owned session to its canonical interview URL", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          status: "session_not_ended",
          retryable: false,
          message: "This interview has not ended yet.",
        },
        { status: 409 }
      )
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);

    expect(
      await screen.findByRole("link", { name: "Return to interview" })
    ).toHaveAttribute("href", `/interview?sessionId=${SESSION_ID}`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("ends a stalled feedback GET before continuing the bounded poll loop", async () => {
    vi.useFakeTimers();
    let feedbackGetAttempts = 0;
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        feedbackGetAttempts += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("request deadline");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await act(async () => undefined);
    expect(feedbackGetAttempts).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_500);
    });

    expect(screen.getByText("Saving your interview")).toBeInTheDocument();
    expect(
      screen.getByText(/reconnecting to your saved interview/i)
    ).toBeInTheDocument();
    expect(feedbackGetAttempts).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(feedbackGetAttempts).toBe(2);
  });

  it("distinguishes a failed transcript read from a successful empty transcript and supports retry", async () => {
    let transcriptAttempts = 0;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return completedFeedbackResponse();
      }
      if (url === `/api/session/${SESSION_ID}/transcript?scope=frozen`) {
        transcriptAttempts += 1;
        return transcriptAttempts === 1
          ? Response.json(
              { error: "transcript_temporarily_unavailable" },
              { status: 503 }
            )
          : Response.json({ scope: "frozen", turns: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await expandTranscript();
    await waitFor(() => expect(transcriptAttempts).toBe(1));

    const failure = await screen.findByRole("alert", undefined, {
      timeout: 5000,
    });
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
      if (url === `/api/session/${SESSION_ID}/transcript?scope=frozen`) {
        return new Promise<Response>((resolve) => {
          resolveTranscript = resolve;
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);
    await expandTranscript();

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
          scope: "frozen",
          turns: [
            {
              id: "650e8400-e29b-41d4-a716-446655440001",
              eventId: "turn-1",
              speaker: "user",
              startedAt: "2099-07-15T21:00:00.000Z",
              text: "Synthetic transcript fixture",
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
    let resolveSecondTranscript: ((response: Response) => void) | undefined;
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/feedback/${SESSION_ID}`) {
        return completedFeedbackResponse(SESSION_ID);
      }
      if (url === `/api/feedback/${SECOND_SESSION_ID}`) {
        return completedFeedbackResponse(
          SECOND_SESSION_ID,
          "Second session summary"
        );
      }
      if (url === `/api/session/${SESSION_ID}/transcript?scope=frozen`) {
        return new Promise<Response>((resolve) => {
          resolveFirstTranscript = resolve;
        });
      }
      if (url === `/api/session/${SECOND_SESSION_ID}/transcript?scope=frozen`) {
        return new Promise<Response>((resolve) => {
          resolveSecondTranscript = resolve;
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    const view = render(<FeedbackPage />);
    await expandTranscript();
    await waitFor(() => expect(resolveFirstTranscript).toBeDefined());

    navigation.sessionId = SECOND_SESSION_ID;
    view.rerender(<FeedbackPage />);
    expect(await screen.findByText("Second session summary")).toBeVisible();
    await expandTranscript();
    await waitFor(() => expect(resolveSecondTranscript).toBeDefined());

    await act(async () => {
      resolveSecondTranscript?.(
        transcriptResponse(SECOND_SESSION_ID, "Current session turn")
      );
    });

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

  it("starts and completes focused practice from completed feedback", async () => {
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/feedback/${SESSION_ID}`) {
          return completedFeedbackResponse();
        }
        if (url === "/api/focused-practice/attempts/start") {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            sourceSessionId: SESSION_ID,
          });
          return Response.json({
            disposition: "created",
            attempt: focusedPracticeAttempt("in_progress"),
          });
        }
        if (
          url ===
          "/api/focused-practice/attempts/focused-practice-attempt-1/complete"
        ) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            contractVersion: "focused-practice-completion.v1",
            practicedAloud: true,
            response: {
              kind: "revised_answer",
              text: "I would revise the answer by naming the user, problem, and priority first.",
            },
          });
          return Response.json({
            disposition: "completed",
            attempt: focusedPracticeAttempt("completed"),
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    );
    vi.stubGlobal("fetch", request);

    render(<FeedbackPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Start focused practice" })
    );

    expect(
      await screen.findByText("Strengthen the Product Sense structure")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not start another interview, use another credit/i)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your revised answer"), {
      target: {
        value:
          "I would revise the answer by naming the user, problem, and priority first.",
      },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I practiced this answer out loud before saving the self-review."
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Save self-review" }));

    expect(
      await screen.findByText("Completed focused practice")
    ).toBeInTheDocument();
    expect(screen.getByText("Your saved self-review")).toBeInTheDocument();
    expect(
      screen.getByText(
        "I would revise the answer by naming the user, problem, and priority first."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Practice this question in another mock interview",
      })
    ).toHaveAttribute("href", "/dashboard/new-interview?questionId=question-1");
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

function processingFeedbackResponse() {
  return Response.json({
    status: "processing",
    retryable: false,
    delayed: true,
  });
}

function savedInterviewWorkspace() {
  return {
    version: "saved-interview.workspace.v1",
    saved: true,
    roundType: "product_sense",
    question: {
      text: "How would you improve a synthetic planning product?",
      company: "Synthetic Co",
    },
    frozenTranscript: "ready",
  };
}

async function exhaustAutomaticPollBudget() {
  await act(async () => undefined);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30 * 3000);
  });
  expect(
    screen.getByRole("heading", { name: "Automatic checking paused" })
  ).toBeInTheDocument();
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
    scope: "frozen",
    turns: [
      {
        id: sessionId,
        eventId: "turn-1",
        speaker: "user",
        startedAt: "2099-07-15T21:00:00.000Z",
        text,
      },
    ],
  });
}

function findTranscriptExpandButton() {
  return screen.findByRole(
    "button",
    { name: "Expand interview transcript" },
    { timeout: 5000 }
  );
}

async function expandTranscript() {
  const button = await findTranscriptExpandButton();
  await act(async () => {
    fireEvent.click(button);
  });
}

function focusedPracticeAttempt(state: "in_progress" | "completed") {
  const base = {
    attemptId: "focused-practice-attempt-1",
    sourceSessionId: SESSION_ID,
    contractVersion: "focused-practice-attempt.v1",
    feedbackVersion: {
      schemaVersion: "feedback.v2",
      promptVersion: "feedback.prompt.v2",
      rubricVersion: "pm-feedback-rubric.v2",
      modelVersion: "synthetic-fixture-model",
      evaluationState: "full",
    },
    plan: {
      state: "available",
      contractVersion: "focused-practice-plan.v1",
      templateVersion: "focused-practice-templates.v1",
      durationMinutes: 5,
      templateId:
        "focused-practice:focused-practice-templates.v1:product_sense:structure:grounded_full",
      title: "Strengthen the Product Sense structure",
      objective:
        "Connect the user goal, problem, solution choice, and prioritization in a clear sequence.",
      instructions: [
        "Use the cited feedback from the completed interview to choose the part of the answer to revise.",
        "Revise the part that connects the chosen user and problem to a clear product decision.",
      ],
      successCriterion:
        "The revision moves from one target user and problem to a prioritized solution with an explicit product rationale.",
      selfReviewPrompt:
        "Can a listener follow the path from target user to problem, solution, and priority without filling in a missing step?",
      source: {
        questionId: "question-1",
        questionText: "Design a product for working parents.",
        recommendationId:
          "pm-drill:pm-drill-templates.v1:product_sense:structure:grounded_full",
        roundType: "product_sense",
        focusDimension: "structure",
        evidenceGap: "grounded_full",
        transcriptRefs: ["turn-2"],
        confidence: 0.8,
      },
    },
    sourceFinding: {
      dimension: "structure",
      observation: "Synthetic structure observation",
      nextStep: "State the user, problem, and priority before solutions.",
      transcriptRefs: ["turn-2"],
      confidence: 0.8,
    },
    startedAt: "2099-07-15T21:00:00.000Z",
  };

  if (state === "in_progress") {
    return {
      ...base,
      state,
      lifecycleVersion: 0,
      completedAt: null,
      completion: null,
    };
  }

  return {
    ...base,
    state,
    lifecycleVersion: 1,
    completedAt: "2099-07-15T21:05:00.000Z",
    completion: {
      contractVersion: "focused-practice-completion.v1",
      practicedAloud: true,
      selfReview: {
        version: "focused-practice-self-review.v1",
        kind: "self_review",
        focusDimension: "structure",
        sourceObservation: "Synthetic structure observation",
        sourceNextStep:
          "State the user, problem, and priority before solutions.",
        successCriterion:
          "The revision moves from one target user and problem to a prioritized solution with an explicit product rationale.",
        prompt:
          "Can a listener follow the path from target user to problem, solution, and priority without filling in a missing step?",
        response: {
          kind: "revised_answer",
          text: "I would revise the answer by naming the user, problem, and priority first.",
        },
      },
    },
  };
}

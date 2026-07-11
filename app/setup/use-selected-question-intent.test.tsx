// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS,
  useSelectedQuestionIntent,
} from "./use-selected-question-intent";

const QUESTION_ID = "550e8400-e29b-41d4-a716-446655440000";

function activeQuestionResponse(questionId = QUESTION_ID) {
  return new Response(
    JSON.stringify({
      id: questionId,
      questionText: "How would you improve activation?",
      questionType: "Product Sense",
      company: "Example",
      isActive: true,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("useSelectedQuestionIntent", () => {
  it("retains selected intent across a retryable failure and Retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(activeQuestionResponse());
    const { result } = renderHook(() =>
      useSelectedQuestionIntent(QUESTION_ID, fetcher)
    );

    await waitFor(() =>
      expect(result.current.state.status).toBe("temporary_error")
    );

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/questions/${QUESTION_ID}`,
      `/api/questions/${QUESTION_ID}`,
    ]);
    expect(result.current.state).toEqual({
      status: "ready",
      roundType: "product_sense",
      question: {
        text: "How would you improve activation?",
        type: "Product Sense",
        company: "Example",
      },
    });
  });

  it.each([400, 404])(
    "treats a %s selected-question response as terminal",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "Question not found" }), {
          status,
        })
      );
      const { result } = renderHook(() =>
        useSelectedQuestionIntent(QUESTION_ID, fetcher)
      );

      await waitFor(() =>
        expect(result.current.state.status).toBe("unavailable")
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  it("treats response parse and network failures as retryable", async () => {
    const parseFailure = new Response("not json", { status: 200 });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(parseFailure)
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    const { result } = renderHook(() =>
      useSelectedQuestionIntent(QUESTION_ID, fetcher)
    );

    await waitFor(() =>
      expect(result.current.state.status).toBe("temporary_error")
    );
    act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.state.status).toBe("temporary_error")
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("times out a never-settling question request and keeps Retry available", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => new Promise<Response>(() => {}))
        .mockResolvedValueOnce(activeQuestionResponse());
      const { result } = renderHook(() =>
        useSelectedQuestionIntent(QUESTION_ID, fetcher)
      );

      expect(result.current.state.status).toBe("loading");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS
        );
      });

      expect(result.current.state.status).toBe("temporary_error");
      act(() => result.current.retry());
      await act(async () => {});
      expect(result.current.state.status).toBe("ready");
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out a never-settling successful response body", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => new Promise<never>(() => {}),
      } as unknown as Response);
      const { result } = renderHook(() =>
        useSelectedQuestionIntent(QUESTION_ID, fetcher)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS
        );
      });

      expect(result.current.state.status).toBe("temporary_error");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stale hanging request without turning the next question into an error", async () => {
    vi.useFakeTimers();
    try {
      const nextQuestionId = "660e8400-e29b-41d4-a716-446655440000";
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => new Promise<Response>(() => {}))
        .mockResolvedValueOnce(activeQuestionResponse(nextQuestionId));
      const { result, rerender } = renderHook(
        ({ questionId }: { questionId: string }) =>
          useSelectedQuestionIntent(questionId, fetcher),
        { initialProps: { questionId: QUESTION_ID } }
      );

      rerender({ questionId: nextQuestionId });
      await act(async () => {});
      expect(result.current.state.status).toBe("ready");
      const firstSignal = fetcher.mock.calls[0]?.[1]?.signal;
      const secondSignal = fetcher.mock.calls[1]?.[1]?.signal;
      expect(firstSignal?.aborted).toBe(true);
      expect(secondSignal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS
        );
      });
      expect(result.current.state.status).toBe("ready");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets to question-free state without fetching when intent is removed", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(activeQuestionResponse());
    const { result, rerender } = renderHook(
      ({ questionId }: { questionId: string | null }) =>
        useSelectedQuestionIntent(questionId, fetcher),
      { initialProps: { questionId: QUESTION_ID as string | null } }
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    rerender({ questionId: null });
    await waitFor(() => expect(result.current.state.status).toBe("none"));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not expose the prior question as ready after the URL intent changes", async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(activeQuestionResponse())
      .mockReturnValueOnce(secondResponse);
    const { result, rerender } = renderHook(
      ({ questionId }: { questionId: string }) =>
        useSelectedQuestionIntent(questionId, fetcher),
      { initialProps: { questionId: QUESTION_ID } }
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    rerender({ questionId: "660e8400-e29b-41d4-a716-446655440000" });

    expect(result.current.state.status).toBe("loading");
    act(() =>
      resolveSecond?.(
        activeQuestionResponse("660e8400-e29b-41d4-a716-446655440000")
      )
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });
});

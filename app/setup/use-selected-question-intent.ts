"use client";

import { useCallback, useEffect, useState } from "react";

import { mapQuestionTypeToRoundType, type RoundType } from "@meelni/core";

export interface SelectedQuestionDetails {
  text: string;
  company: string | null;
  type: string;
}

export type SelectedQuestionIntentState =
  | { status: "none" }
  | { status: "loading" }
  | {
      status: "ready";
      question: SelectedQuestionDetails;
      roundType: RoundType;
    }
  | { status: "unavailable" }
  | { status: "temporary_error" };

type QuestionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const RETRYABLE_RESPONSE_STATUSES = new Set([408, 425, 429]);
export const SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS = 8_000;

const VERIFICATION_TIMED_OUT = Symbol("verification_timed_out");
const VERIFICATION_CANCELLED = Symbol("verification_cancelled");

async function fetchSelectedQuestionIntent(
  questionId: string,
  fetcher: QuestionFetcher,
  signal: AbortSignal
): Promise<SelectedQuestionIntentState> {
  const requestController = new AbortController();
  let timedOut = false;
  let cancelled = false;
  let settleControl:
    | ((
        outcome: typeof VERIFICATION_TIMED_OUT | typeof VERIFICATION_CANCELLED
      ) => void)
    | undefined;

  const control = new Promise<
    typeof VERIFICATION_TIMED_OUT | typeof VERIFICATION_CANCELLED
  >((resolve) => {
    settleControl = resolve;
  });

  const cancelForCaller = () => {
    cancelled = true;
    requestController.abort();
    settleControl?.(VERIFICATION_CANCELLED);
  };

  if (signal.aborted) {
    cancelForCaller();
  } else {
    signal.addEventListener("abort", cancelForCaller, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    requestController.abort();
    settleControl?.(VERIFICATION_TIMED_OUT);
  }, SELECTED_QUESTION_VERIFICATION_TIMEOUT_MS);

  try {
    const verification = (async (): Promise<SelectedQuestionIntentState> => {
      const response = await fetcher(
        `/api/questions/${encodeURIComponent(questionId)}`,
        { signal: requestController.signal }
      );

      if (!response.ok) {
        return response.status >= 500 ||
          RETRYABLE_RESPONSE_STATUSES.has(response.status)
          ? { status: "temporary_error" }
          : { status: "unavailable" };
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        if (requestController.signal.aborted) {
          throw error;
        }
        return { status: "temporary_error" };
      }

      if (
        !isSelectedQuestionPayload(data) ||
        data.id.toLowerCase() !== questionId.toLowerCase()
      ) {
        return { status: "unavailable" };
      }

      const roundType = mapQuestionTypeToRoundType(data.questionType);
      if (!roundType) {
        return { status: "unavailable" };
      }

      return {
        status: "ready",
        question: {
          text: data.questionText,
          company: data.company,
          type: data.questionType,
        },
        roundType,
      };
    })();

    const outcome = await Promise.race([verification, control]);

    if (outcome === VERIFICATION_CANCELLED) {
      return { status: "loading" };
    }
    if (outcome === VERIFICATION_TIMED_OUT) {
      return { status: "temporary_error" };
    }
    return outcome;
  } catch (error) {
    if (cancelled || signal.aborted) {
      return { status: "loading" };
    }
    if (timedOut) {
      return { status: "temporary_error" };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "temporary_error" };
    }
    return { status: "temporary_error" };
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", cancelForCaller);
  }
}

export function useSelectedQuestionIntent(
  questionId: string | null,
  fetcher: QuestionFetcher = fetch
) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    questionId: string | null;
    state: SelectedQuestionIntentState;
  }>(() => ({
    questionId,
    state: questionId ? { status: "loading" } : { status: "none" },
  }));

  useEffect(() => {
    if (!questionId) {
      setSnapshot({ questionId: null, state: { status: "none" } });
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;
    setSnapshot({ questionId, state: { status: "loading" } });

    void fetchSelectedQuestionIntent(
      questionId,
      fetcher,
      controller.signal
    ).then((nextState) => {
      if (isCurrent && !controller.signal.aborted) {
        setSnapshot({ questionId, state: nextState });
      }
    });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [fetcher, questionId, retryVersion]);

  const retry = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  const state: SelectedQuestionIntentState =
    snapshot.questionId === questionId
      ? snapshot.state
      : questionId
        ? { status: "loading" }
        : { status: "none" };

  return { state, retry };
}

function isSelectedQuestionPayload(value: unknown): value is {
  id: string;
  questionText: string;
  questionType: string;
  company: string | null;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.questionText === "string" &&
    Boolean(record.questionText.trim()) &&
    typeof record.questionType === "string" &&
    Boolean(record.questionType.trim()) &&
    (record.company === null || typeof record.company === "string")
  );
}

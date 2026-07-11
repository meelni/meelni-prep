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

async function fetchSelectedQuestionIntent(
  questionId: string,
  fetcher: QuestionFetcher,
  signal: AbortSignal
): Promise<SelectedQuestionIntentState> {
  try {
    const response = await fetcher(
      `/api/questions/${encodeURIComponent(questionId)}`,
      { signal }
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
    } catch {
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "loading" };
    }
    return { status: "temporary_error" };
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FEEDBACK_QUALITY_COMMON_REASONS,
  FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  isFeedbackQualitySelectionValid,
  parseFeedbackQualitySignalView,
  type FeedbackQualityOutcome,
  type FeedbackQualityReason,
  type FeedbackQualityResponse,
  type FeedbackQualitySignalView,
} from "@meelni/core";

import { FeedbackSectionCard } from "./feedback-surface";

const REASON_LABELS: Record<FeedbackQualityReason, string> = {
  not_specific_enough: "The feedback was not specific enough",
  evidence_did_not_match: "The cited evidence did not match my answer",
  next_step_unclear: "The next step was unclear",
  too_much_to_use: "There was too much to use easily",
  score_explanation_unclear: "The score explanation was unclear",
  score_withholding_unclear: "Why scores were withheld was unclear",
};

type LoadState = "loading" | "ready" | "unavailable" | "error";

interface FeedbackQualityOwnedState {
  outcome: FeedbackQualityOutcome;
  signal: FeedbackQualitySignalView | null;
}

export function FeedbackQualityControl({
  sessionId,
  outcome,
}: {
  sessionId: string;
  outcome: FeedbackQualityOutcome;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [current, setCurrent] = useState<FeedbackQualitySignalView | null>(
    null
  );
  const [response, setResponse] = useState<FeedbackQualityResponse | null>(
    null
  );
  const [reason, setReason] = useState<FeedbackQualityReason | null>(null);
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const requestRef = useRef<{
    sequence: number;
    controller: AbortController;
  } | null>(null);

  const beginRequest = useCallback(() => {
    requestRef.current?.controller.abort();
    const request = {
      sequence: (requestRef.current?.sequence ?? 0) + 1,
      controller: new AbortController(),
    };
    requestRef.current = request;
    return request;
  }, []);

  const isCurrentRequest = useCallback(
    (sequence: number) => requestRef.current?.sequence === sequence,
    []
  );

  const hydrate = useCallback(async () => {
    const request = beginRequest();
    pendingRef.current = false;
    setPending(false);
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const result = await fetch(
        `/api/feedback/${encodeURIComponent(sessionId)}/quality-signal`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: request.controller.signal,
        }
      );
      if (!isCurrentRequest(request.sequence)) return;
      if (result.status === 404) {
        setLoadState("unavailable");
        return;
      }
      if (!result.ok) throw new Error("quality_signal_load_failed");
      const state = parseOwnedState(await result.json());
      if (!state || state.outcome !== outcome) {
        throw new Error("quality_signal_load_invalid");
      }
      setCurrent(state.signal);
      setResponse(state.signal?.response ?? null);
      setReason(state.signal?.reason ?? null);
      setLoadState("ready");
    } catch {
      if (request.controller.signal.aborted) return;
      setLoadState("error");
      setErrorMessage("Your saved response could not be loaded. Try again.");
    }
  }, [beginRequest, isCurrentRequest, outcome, sessionId]);

  useEffect(() => {
    void hydrate();
    return () => requestRef.current?.controller.abort();
  }, [hydrate]);

  const submit = useCallback(
    async (
      nextResponse: FeedbackQualityResponse,
      nextReason: FeedbackQualityReason | null
    ) => {
      if (
        pendingRef.current ||
        !isFeedbackQualitySelectionValid(outcome, nextResponse, nextReason)
      ) {
        return;
      }
      const request = beginRequest();
      pendingRef.current = true;
      setPending(true);
      setStatusMessage(null);
      setErrorMessage(null);
      try {
        const result = await fetch(
          `/api/feedback/${encodeURIComponent(sessionId)}/quality-signal`,
          {
            method: "PUT",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
              response: nextResponse,
              reason: nextReason,
              expectedRevision: current?.revision ?? null,
            }),
            signal: request.controller.signal,
          }
        );
        if (!isCurrentRequest(request.sequence)) return;
        const body: unknown = await result.json().catch(() => null);
        if (result.status === 409) {
          const conflict = parseConflictState(body);
          if (!conflict || conflict.outcome !== outcome) {
            throw new Error("quality_signal_conflict_invalid");
          }
          setCurrent(conflict.signal);
          setErrorMessage(
            "This response changed in another tab. Your selection is still here; review it and try again."
          );
          return;
        }
        if (!result.ok) throw new Error("quality_signal_save_failed");
        const saved = parseWriteState(body);
        if (!saved || saved.state.outcome !== outcome || !saved.state.signal) {
          throw new Error("quality_signal_save_invalid");
        }
        setCurrent(saved.state.signal);
        setResponse(saved.state.signal.response);
        setReason(saved.state.signal.reason);
        setStatusMessage(
          saved.disposition === "updated"
            ? "Response updated."
            : saved.disposition === "unchanged"
              ? "Response already saved."
              : "Response saved."
        );
      } catch {
        if (request.controller.signal.aborted) return;
        setErrorMessage(
          "Your response was not saved. Your selection is still here; try again."
        );
      } finally {
        if (isCurrentRequest(request.sequence)) {
          pendingRef.current = false;
          setPending(false);
        }
      }
    },
    [beginRequest, current?.revision, isCurrentRequest, outcome, sessionId]
  );

  if (loadState === "unavailable") return null;

  if (loadState === "loading" || loadState === "error") {
    return (
      <FeedbackSectionCard title="Did this review help?" tone="info">
        <div className="space-y-3">
          {loadState === "loading" ? (
            <p className="text-muted-foreground text-sm" role="status">
              Loading your saved response…
            </p>
          ) : (
            <>
              <p className="text-destructive text-sm" role="alert">
                {errorMessage}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                onClick={() => void hydrate()}
              >
                Try again
              </Button>
            </>
          )}
        </div>
      </FeedbackSectionCard>
    );
  }

  const availableReasons = reasonsForOutcome(outcome);
  return (
    <FeedbackSectionCard
      title="Did this review help?"
      description="Your response helps improve review quality. No interview text is included."
      tone="info"
      contentClassName="space-y-5"
    >
      <fieldset className="min-w-0 space-y-4" disabled={pending}>
        <legend className="sr-only">Was this review helpful?</legend>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant={response === "helpful" ? "default" : "outline"}
            className="min-h-11 w-full sm:w-auto"
            aria-pressed={response === "helpful"}
            onClick={() => {
              setResponse("helpful");
              setReason(null);
              void submit("helpful", null);
            }}
          >
            Helpful
          </Button>
          <Button
            type="button"
            variant={response === "not_helpful" ? "default" : "outline"}
            className="min-h-11 w-full sm:w-auto"
            aria-pressed={response === "not_helpful"}
            onClick={() => {
              setResponse("not_helpful");
              if (
                reason &&
                !isFeedbackQualitySelectionValid(outcome, "not_helpful", reason)
              ) {
                setReason(null);
              }
              setStatusMessage(null);
              setErrorMessage(null);
            }}
          >
            Not helpful
          </Button>
        </div>

        {response === "not_helpful" && (
          <fieldset className="border-border min-w-0 space-y-3 rounded-lg border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">
              What could be better? Optional
            </legend>
            <div className="space-y-2">
              {availableReasons.map((item) => (
                <label
                  key={item}
                  className="border-border/70 bg-background/40 focus-within:ring-ring flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm focus-within:ring-2"
                >
                  <input
                    type="radio"
                    name={`feedback-quality-reason-${sessionId}`}
                    value={item}
                    checked={reason === item}
                    onChange={() => setReason(item)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 break-words">
                    {REASON_LABELS[item]}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                onClick={() => void submit("not_helpful", reason)}
              >
                {pending ? "Saving…" : "Save response"}
              </Button>
              {reason && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => setReason(null)}
                >
                  Clear reason
                </Button>
              )}
            </div>
          </fieldset>
        )}
      </fieldset>

      {statusMessage && (
        <p className="text-success text-sm" role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}
    </FeedbackSectionCard>
  );
}

function reasonsForOutcome(
  outcome: FeedbackQualityOutcome
): FeedbackQualityReason[] {
  return [
    ...FEEDBACK_QUALITY_COMMON_REASONS,
    outcome === "coaching_review"
      ? "score_withholding_unclear"
      : "score_explanation_unclear",
  ];
}

export function parseOwnedState(
  value: unknown
): FeedbackQualityOwnedState | null {
  if (!hasExactKeys(value, ["outcome", "signal"])) return null;
  if (!isQualityOutcome(value.outcome)) return null;
  const signal =
    value.signal === null ? null : parseFeedbackQualitySignalView(value.signal);
  if (value.signal !== null && !signal) return null;
  if (signal && signal.outcome !== value.outcome) return null;
  return { outcome: value.outcome, signal };
}

function parseWriteState(value: unknown): {
  disposition: "created" | "updated" | "unchanged";
  state: FeedbackQualityOwnedState;
} | null {
  if (!hasExactKeys(value, ["disposition", "outcome", "signal"])) return null;
  if (
    value.disposition !== "created" &&
    value.disposition !== "updated" &&
    value.disposition !== "unchanged"
  ) {
    return null;
  }
  const state = parseOwnedState({
    outcome: value.outcome,
    signal: value.signal,
  });
  return state ? { disposition: value.disposition, state } : null;
}

function parseConflictState(value: unknown): FeedbackQualityOwnedState | null {
  if (!hasExactKeys(value, ["error", "outcome", "signal"])) return null;
  return value.error === "feedback_quality_conflict"
    ? parseOwnedState({ outcome: value.outcome, signal: value.signal })
    : null;
}

function isQualityOutcome(value: unknown): value is FeedbackQualityOutcome {
  return value === "scorecard" || value === "coaching_review";
}

function hasExactKeys(
  value: unknown,
  expected: readonly string[]
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

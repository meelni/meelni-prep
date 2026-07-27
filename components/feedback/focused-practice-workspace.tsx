"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Mic2, RefreshCw, Target } from "lucide-react";

import { FeedbackSectionCard } from "./feedback-surface";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/app-surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  FocusedPracticeAttempt,
  FocusedPracticeResponse,
} from "@meelni/core";

type FocusedPracticeAttemptView = FocusedPracticeAttempt extends infer Attempt
  ? Attempt extends unknown
    ? Omit<Attempt, "userId" | "sourceFeedbackId">
    : never
  : never;

type ResponseKind = FocusedPracticeResponse["kind"];

const COMPLETION_CONTRACT_VERSION = "focused-practice-completion.v1";
const RESPONSE_LIMITS = {
  revised_answer: 8_000,
  reflection: 2_000,
} as const satisfies Record<ResponseKind, number>;

const responseKindLabels: Record<ResponseKind, string> = {
  revised_answer: "Revised answer",
  reflection: "Reflection",
};

const dimensionLabels: Record<
  FocusedPracticeAttemptView["sourceFinding"]["dimension"],
  string
> = {
  structure: "Structure",
  clarity: "Clarity",
  insight: "Insight",
  communication: "Communication",
  leadership: "Leadership",
};

interface FocusedPracticeWorkspaceProps {
  sourceSessionId: string;
}

export function FocusedPracticeWorkspace({
  sourceSessionId,
}: FocusedPracticeWorkspaceProps) {
  const [attempt, setAttempt] = useState<FocusedPracticeAttemptView | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseKind, setResponseKind] =
    useState<ResponseKind>("revised_answer");
  const [responseText, setResponseText] = useState("");
  const [practicedAloud, setPracticedAloud] = useState(false);

  const responseLimit = RESPONSE_LIMITS[responseKind];
  const trimmedResponse = responseText.trim();
  const canSubmit =
    attempt?.state === "in_progress" &&
    practicedAloud &&
    trimmedResponse.length > 0 &&
    trimmedResponse.length <= responseLimit &&
    !submitting;

  const startLabel = useMemo(() => {
    if (loading) return "Preparing focused practice";
    if (attempt?.state === "in_progress") return "Resume focused practice";
    if (attempt?.state === "completed") return "Review completed practice";
    return "Start focused practice";
  }, [attempt?.state, loading]);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<{ attempt: FocusedPracticeAttemptView }>(
        "/api/focused-practice/attempts/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceSessionId }),
        }
      );
      setAttempt(result.attempt);
      if (result.attempt.state === "completed") {
        setResponseKind(result.attempt.completion.selfReview.response.kind);
        setResponseText(result.attempt.completion.selfReview.response.text);
        setPracticedAloud(true);
      }
    } catch (cause) {
      setError(getFocusedPracticeErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    if (!attempt || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestJson<{ attempt: FocusedPracticeAttemptView }>(
        `/api/focused-practice/attempts/${encodeURIComponent(
          attempt.attemptId
        )}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractVersion: COMPLETION_CONTRACT_VERSION,
            practicedAloud: true,
            response: {
              kind: responseKind,
              text: trimmedResponse,
            },
          }),
        }
      );
      setAttempt(result.attempt);
      if (result.attempt.state === "completed") {
        setResponseKind(result.attempt.completion.selfReview.response.kind);
        setResponseText(result.attempt.completion.selfReview.response.text);
        setPracticedAloud(true);
      }
    } catch (cause) {
      setError(getFocusedPracticeErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeedbackSectionCard
      title="Focused practice"
      description="Turn one feedback point into a short answer revision. This does not start another interview, use another credit, or create a new score."
      icon={<Target className="h-5 w-5" aria-hidden="true" />}
      tone="info"
      action={
        <Button
          type="button"
          variant={attempt ? "outline" : "default"}
          size="sm"
          className="h-auto min-h-11 max-w-full whitespace-normal"
          onClick={start}
          disabled={loading || submitting}
        >
          {loading && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {startLabel}
        </Button>
      }
      contentClassName="space-y-6"
    >
      {error && (
        <div
          role="alert"
          className="border-warning/20 bg-warning/5 text-foreground rounded-lg border p-4 text-sm leading-6"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto min-h-11 px-0"
            onClick={start}
            disabled={loading || submitting}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {!attempt && (
        <ol className="divide-border divide-y">
          {[
            [
              "Use the feedback",
              "Pick the most actionable feedback point from this interview.",
            ],
            [
              "Practice aloud",
              "Spend five minutes revising the answer as if an interviewer were listening.",
            ],
            [
              "Compare honestly",
              "Check the revision against the original evidence. This is self-review, not a new score.",
            ],
          ].map(([title, description], index) => (
            <li key={title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="bg-info/10 text-info flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="text-foreground block font-medium">
                  {title}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm leading-6">
                  {description}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {attempt?.state === "in_progress" && (
        <InProgressAttempt
          attempt={attempt}
          responseKind={responseKind}
          responseText={responseText}
          practicedAloud={practicedAloud}
          responseLimit={responseLimit}
          canSubmit={canSubmit}
          submitting={submitting}
          onResponseKindChange={(kind) => {
            setResponseKind(kind);
            setResponseText((text) => text.slice(0, RESPONSE_LIMITS[kind]));
          }}
          onResponseTextChange={setResponseText}
          onPracticedAloudChange={setPracticedAloud}
          onComplete={complete}
        />
      )}

      {attempt?.state === "completed" && <CompletedAttempt attempt={attempt} />}
    </FeedbackSectionCard>
  );
}

function InProgressAttempt({
  attempt,
  responseKind,
  responseText,
  practicedAloud,
  responseLimit,
  canSubmit,
  submitting,
  onResponseKindChange,
  onResponseTextChange,
  onPracticedAloudChange,
  onComplete,
}: {
  attempt: Extract<FocusedPracticeAttemptView, { state: "in_progress" }>;
  responseKind: ResponseKind;
  responseText: string;
  practicedAloud: boolean;
  responseLimit: number;
  canSubmit: boolean;
  submitting: boolean;
  onResponseKindChange(kind: ResponseKind): void;
  onResponseTextChange(text: string): void;
  onPracticedAloudChange(value: boolean): void;
  onComplete(): void;
}) {
  const count = responseText.length;

  return (
    <div className="space-y-6">
      <AttemptPlan attempt={attempt} />

      <fieldset className="space-y-3">
        <legend className="text-foreground text-sm font-semibold">
          Practice format
        </legend>
        <div className="flex flex-col gap-3 sm:flex-row">
          {(["revised_answer", "reflection"] as const).map((kind) => (
            <label
              key={kind}
              className={cn(
                "border-border/70 bg-background/50 flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                responseKind === kind && "border-primary bg-primary/5"
              )}
            >
              <input
                className="mt-1"
                type="radio"
                name={`focused-practice-response-kind-${attempt.attemptId}`}
                value={kind}
                checked={responseKind === kind}
                onChange={() => onResponseKindChange(kind)}
              />
              <span className="min-w-0">
                <span className="text-foreground block font-medium">
                  {responseKindLabels[kind]}
                </span>
                <span className="text-muted-foreground mt-1 block leading-5">
                  {kind === "revised_answer"
                    ? "Write the answer you would give next time."
                    : "Capture what changed and what you would say differently."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label
          htmlFor={`focused-practice-response-${attempt.attemptId}`}
          className="text-foreground text-sm font-semibold"
        >
          Your {responseKindLabels[responseKind].toLowerCase()}
        </label>
        <Textarea
          id={`focused-practice-response-${attempt.attemptId}`}
          value={responseText}
          maxLength={responseLimit}
          onChange={(event) => onResponseTextChange(event.target.value)}
          placeholder="Answer out loud first, then write the version you want to remember."
          className="min-h-40 resize-y leading-6"
        />
        <p
          className={cn(
            "text-muted-foreground text-xs",
            count > responseLimit && "text-destructive"
          )}
        >
          {count.toLocaleString()} / {responseLimit.toLocaleString()} characters
        </p>
      </div>

      <label className="border-border/70 bg-background/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={practicedAloud}
          onChange={(event) => onPracticedAloudChange(event.target.checked)}
        />
        <span className="min-w-0 leading-6">
          I practiced this answer out loud before saving the self-review.
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          className="h-auto min-h-11"
          onClick={onComplete}
          disabled={!canSubmit}
        >
          {submitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Save self-review
        </Button>
        <p className="text-muted-foreground text-sm leading-6">
          Saving is terminal for this attempt so the comparison stays stable.
        </p>
      </div>
    </div>
  );
}

function CompletedAttempt({
  attempt,
}: {
  attempt: Extract<FocusedPracticeAttemptView, { state: "completed" }>;
}) {
  const review = attempt.completion.selfReview;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="success">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Completed focused practice
        </StatusPill>
        <StatusPill tone="muted">
          {responseKindLabels[review.response.kind]}
        </StatusPill>
      </div>

      <AttemptPlan attempt={attempt} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-border/70 bg-background/50 rounded-lg border p-4">
          <h3 className="text-foreground text-sm font-semibold">
            Original feedback signal
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {review.sourceObservation}
          </p>
          <p className="text-foreground/80 mt-4 text-sm leading-6">
            Next step: {review.sourceNextStep}
          </p>
        </div>
        <div className="border-success/20 bg-success/5 rounded-lg border p-4">
          <h3 className="text-foreground text-sm font-semibold">
            Your saved self-review
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {review.prompt}
          </p>
          <blockquote className="text-foreground mt-4 text-sm leading-6 whitespace-pre-wrap">
            {review.response.text}
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function AttemptPlan({ attempt }: { attempt: FocusedPracticeAttemptView }) {
  return (
    <div className="border-border/70 bg-background/50 space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill>
          {dimensionLabels[attempt.plan.source.focusDimension]}
        </StatusPill>
        <StatusPill tone="muted">
          {attempt.plan.durationMinutes} minutes
        </StatusPill>
      </div>
      <div className="space-y-2">
        <h3 className="text-foreground text-lg font-semibold">
          {attempt.plan.title}
        </h3>
        <p className="text-muted-foreground leading-6">
          {attempt.plan.objective}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Source question
          </h4>
          <p className="text-foreground mt-2 text-sm leading-6">
            {attempt.plan.source.questionText}
          </p>
        </div>
        <div>
          <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Success criterion
          </h4>
          <p className="text-foreground mt-2 text-sm leading-6">
            {attempt.plan.successCriterion}
          </p>
        </div>
      </div>
      <ol className="space-y-3">
        {attempt.plan.instructions.map((instruction, index) => (
          <li key={instruction} className="flex gap-3 text-sm leading-6">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {index + 1}
            </span>
            <span className="min-w-0">{instruction}</span>
          </li>
        ))}
      </ol>
      <p className="border-info/20 bg-info/5 text-foreground rounded-lg border p-3 text-sm leading-6">
        <Mic2
          className="mr-2 inline h-4 w-4 align-text-bottom"
          aria-hidden="true"
        />
        Practice aloud first, then write the version you want to keep.
      </p>
    </div>
  );
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new FocusedPracticeRequestError(response.status, readError(payload));
  }
  if (!payload || typeof payload !== "object") {
    throw new FocusedPracticeRequestError(response.status, "invalid_response");
  }
  return payload as T;
}

function readError(payload: unknown) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : "focused_practice_unavailable";
}

class FocusedPracticeRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function getFocusedPracticeErrorMessage(cause: unknown) {
  if (!(cause instanceof FocusedPracticeRequestError)) {
    return "Focused practice could not be loaded. Please try again.";
  }
  if (cause.status === 401) {
    return "Sign in again to continue focused practice.";
  }
  if (cause.status === 403) {
    return "Focused practice is not available for this feedback yet.";
  }
  if (cause.status === 404) {
    return "This feedback is no longer available for focused practice.";
  }
  if (cause.status === 409) {
    return "This practice attempt changed in another tab. Reload the feedback page and try again.";
  }
  if (cause.status >= 500) {
    return "Focused practice is temporarily unavailable. Your interview feedback is still saved.";
  }
  return "Check the practice response and try again.";
}

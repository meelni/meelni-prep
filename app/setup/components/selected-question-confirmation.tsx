import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { StatusPill } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";

export interface SelectedQuestionDetails {
  text: string;
  company: string | null;
  type: string;
}

export type SelectedQuestionIntentState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; question: SelectedQuestionDetails }
  | { status: "unavailable" };

interface SelectedQuestionConfirmationProps {
  state: Exclude<SelectedQuestionIntentState, { status: "none" }>;
  changeQuestionHref: string;
  continueWithoutQuestionHref: string;
}

export function SelectedQuestionConfirmation({
  state,
  changeQuestionHref,
  continueWithoutQuestionHref,
}: SelectedQuestionConfirmationProps) {
  if (state.status === "loading") {
    return (
      <section
        aria-live="polite"
        aria-busy="true"
        className="border-dashboard-panel-border bg-dashboard-panel rounded-lg border p-5"
      >
        <div className="text-dashboard-muted flex min-h-20 items-center gap-3 text-sm">
          <Loader2 className="text-primary h-5 w-5 shrink-0 animate-spin" />
          <span>Checking your selected question…</span>
        </div>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section
        aria-labelledby="selected-question-recovery-title"
        className="border-destructive/25 bg-destructive/5 rounded-lg border p-5"
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            className="text-destructive mt-0.5 h-5 w-5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-1">
              <h2
                id="selected-question-recovery-title"
                className="text-dashboard-foreground text-base font-semibold"
              >
                This question is no longer available
              </h2>
              <p className="text-dashboard-muted max-w-2xl text-sm leading-6">
                The link may be outdated, or the question may have been removed
                from the active practice bank. Choose another question or keep
                the rest of your interview settings.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-full sm:w-auto">
                <Link href={changeQuestionHref}>
                  Choose another question
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={continueWithoutQuestionHref}>
                  Continue without this question
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="selected-question-title"
      className="border-primary/25 bg-primary/5 rounded-lg border p-5"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Selected question
            </StatusPill>
            <StatusPill tone="muted">
              {state.question.company ?? "Company not listed"}
            </StatusPill>
            <StatusPill tone="muted">{state.question.type}</StatusPill>
          </div>
          <div className="space-y-1">
            <h2
              id="selected-question-title"
              className="text-dashboard-muted text-sm font-medium"
            >
              Confirm your question
            </h2>
            <p className="text-dashboard-foreground max-w-3xl text-base leading-7 [overflow-wrap:anywhere] break-words">
              {state.question.text}
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row lg:flex-col">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={changeQuestionHref}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Change question
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href={continueWithoutQuestionHref}>Remove selection</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

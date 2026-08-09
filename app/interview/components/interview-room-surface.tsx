"use client";

import type { ReactNode } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import {
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import type { InterviewConnectionStatus } from "@/components/interview/session-recovery";
import { Button } from "@/components/ui/button";
import type { DurableTranscriptHydrationState } from "@/lib/interview/transcript-hydration";

export interface InterviewRoomSurfaceProps {
  company?: string | null;
  connectionIndicator?: ReactNode;
  connectionStatus: InterviewConnectionStatus;
  controls?: ReactNode;
  deadlineReached: boolean;
  mediaVisualizer?: ReactNode;
  question?: string | null;
  roundType?: string | null;
  timer?: ReactNode;
  transcriptIntegrity: "healthy" | "retrying" | "degraded";
  transcriptHydrationState: DurableTranscriptHydrationState;
  onRetryTranscriptHydration?: () => void;
  transcriptPanel?: ReactNode;
}

export function InterviewRoomSurface({
  company,
  connectionIndicator,
  connectionStatus,
  controls,
  deadlineReached,
  mediaVisualizer,
  question,
  roundType,
  timer,
  transcriptIntegrity,
  transcriptHydrationState,
  onRetryTranscriptHydration,
  transcriptPanel,
}: InterviewRoomSurfaceProps) {
  const roundLabel = roundType
    ? roundType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "PM Interview";

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="bg-background/90 border-border sticky top-0 z-40 w-full border-b backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-col justify-center gap-2 px-4 py-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-0 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <StatusPill tone="primary" className="shrink-0">
              {roundLabel}
            </StatusPill>
            {connectionIndicator}
            {connectionStatus === "recovered" && (
              <StatusPill tone="success" aria-live="polite">
                Connection restored
              </StatusPill>
            )}
            {connectionStatus === "delayed" && (
              <StatusPill tone="warning" role="status" aria-live="polite">
                Room connected. The interviewer is still joining; End remains
                available.
              </StatusPill>
            )}
            {connectionStatus === "transport_delayed" && (
              <StatusPill tone="warning" role="status" aria-live="polite">
                Room connection is taking longer than expected. End remains
                available.
              </StatusPill>
            )}
            {connectionStatus === "syncing" && (
              <StatusPill tone="muted" role="status" aria-live="polite">
                Interview active. Syncing status in the background.
              </StatusPill>
            )}
          </div>
          <div className="self-end sm:self-auto">{timer}</div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-7xl grid-cols-1 gap-0 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="flex min-h-[560px] flex-col items-center justify-between py-6 lg:min-h-[calc(100dvh-6rem)] lg:pr-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 text-center sm:gap-7">
            {question ? (
              <div className="max-w-2xl space-y-2">
                <h1 className="font-display text-xl leading-tight font-light tracking-tight text-balance sm:text-2xl">
                  {question}
                </h1>
                {company && (
                  <p className="text-muted-foreground text-sm">{company}</p>
                )}
              </div>
            ) : (
              <h1 className="sr-only">Live PM interview</h1>
            )}

            <div className="h-[260px] w-full max-w-[420px] sm:h-[320px]">
              {mediaVisualizer}
            </div>
          </div>

          <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mt-6">
            {!deadlineReached && controls}
          </div>
        </section>

        <aside className="border-border bg-card flex min-h-[420px] flex-col overflow-hidden rounded-lg border lg:sticky lg:top-[4.5rem] lg:h-[calc(100dvh-5.5rem)]">
          <AppSurfaceHeader className="flex items-start justify-between gap-3">
            <div>
              <AppSurfaceTitle>Transcript</AppSurfaceTitle>
              {transcriptIntegrity !== "healthy" && (
                <AppSurfaceDescription>
                  {transcriptIntegrity === "retrying"
                    ? "Checking that the latest turns are stored before the interview closes."
                    : "Some recent turns could not be verified. Keep the room open and retry ending the interview in a moment."}
                </AppSurfaceDescription>
              )}
            </div>
            {transcriptIntegrity !== "healthy" && (
              <StatusPill
                tone="warning"
                className="shrink-0"
                role={transcriptIntegrity === "retrying" ? "status" : "alert"}
                aria-live={
                  transcriptIntegrity === "retrying" ? "polite" : "assertive"
                }
                aria-atomic="true"
              >
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {transcriptIntegrity === "retrying"
                  ? "Verifying"
                  : "Needs recovery"}
                <span className="sr-only">
                  {transcriptIntegrity === "retrying"
                    ? ". Checking that the latest transcript turns are stored."
                    : ". Some recent transcript turns could not be verified. Keep the room open and retry ending the interview in a moment."}
                </span>
              </StatusPill>
            )}
          </AppSurfaceHeader>
          {transcriptHydrationState !== "ready" && (
            <TranscriptHydrationStatus
              state={transcriptHydrationState}
              onRetry={onRetryTranscriptHydration}
            />
          )}
          <div className="min-h-0 flex-1">{transcriptPanel}</div>
        </aside>
      </main>
    </div>
  );
}

function TranscriptHydrationStatus({
  state,
  onRetry,
}: {
  state: Exclude<DurableTranscriptHydrationState, "ready">;
  onRetry?: () => void;
}) {
  const busy = state === "loading" || state === "retrying";
  const message =
    state === "loading"
      ? "Loading saved transcript…"
      : state === "empty"
        ? "No saved transcript turns yet."
        : state === "retrying"
          ? "Saved transcript is taking longer to load. New turns will still appear here."
          : "Saved transcript couldn’t be loaded. New turns will still appear here.";

  return (
    <div
      className="border-border bg-muted/30 text-muted-foreground flex min-h-11 items-center gap-2 border-b px-4 py-2 text-xs"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={busy}
    >
      {busy ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : state === "degraded" ? (
        <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 flex-1">{message}</span>
      {state === "degraded" && onRetry && (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="shrink-0 px-2.5 text-xs"
          onClick={onRetry}
        >
          Retry transcript
        </Button>
      )}
    </div>
  );
}

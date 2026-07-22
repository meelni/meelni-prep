"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import {
  AppSurfaceDescription,
  AppSurfaceHeader,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import type { InterviewConnectionStatus } from "@/components/interview/session-recovery";

export interface InterviewRoomSurfaceProps {
  agentState: "idle" | "listening" | "thinking" | "speaking";
  company?: string | null;
  connectionIndicator?: ReactNode;
  connectionStatus: InterviewConnectionStatus;
  controls?: ReactNode;
  deadlineReached: boolean;
  mediaVisualizer?: ReactNode;
  question?: string | null;
  recoveringConnection: boolean;
  roundType?: string | null;
  timer?: ReactNode;
  transcriptIntegrity: "healthy" | "retrying" | "degraded";
  transcriptPanel?: ReactNode;
}

export function InterviewRoomSurface({
  agentState,
  company,
  connectionIndicator,
  connectionStatus,
  controls,
  deadlineReached,
  mediaVisualizer,
  question,
  recoveringConnection,
  roundType,
  timer,
  transcriptIntegrity,
  transcriptPanel,
}: InterviewRoomSurfaceProps) {
  const connectionReady =
    connectionStatus === "connected" || connectionStatus === "recovered";
  const roundLabel = roundType
    ? roundType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "PM Interview";

  return (
    <div className="bg-background text-foreground min-h-screen">
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
          </div>
          <div className="self-end sm:self-auto">{timer}</div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-7xl grid-cols-1 gap-0 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="flex min-h-[620px] flex-col items-center justify-between py-6 lg:min-h-[calc(100vh-6rem)] lg:pr-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 text-center">
            <div className="space-y-3">
              <StatusPill tone="muted">Real interview</StatusPill>
              <StatusPill tone="muted">
                {agentState.charAt(0).toUpperCase() + agentState.slice(1)}
              </StatusPill>
              <h1 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                {question || "Your interviewer is ready."}
              </h1>
              {company && (
                <p className="text-muted-foreground text-sm">{company}</p>
              )}
            </div>

            <div className="h-[280px] w-full max-w-[520px] sm:h-[360px]">
              {mediaVisualizer}
            </div>
          </div>

          <div className="sticky bottom-4 z-30 mt-6">
            {!deadlineReached &&
              !recoveringConnection &&
              connectionReady &&
              controls}
          </div>
        </section>

        <aside className="border-border bg-card flex min-h-[420px] flex-col overflow-hidden rounded-lg border lg:sticky lg:top-[4.5rem] lg:h-[calc(100vh-5.5rem)]">
          <AppSurfaceHeader className="flex items-start justify-between gap-3">
            <div>
              <AppSurfaceTitle>Transcript</AppSurfaceTitle>
              <AppSurfaceDescription>
                {transcriptIntegrity === "healthy"
                  ? "Conversation turns are saved as the room runs."
                  : transcriptIntegrity === "retrying"
                    ? "Checking that the latest turns are stored before the interview closes."
                    : "Some recent turns could not be verified. Keep the room open and retry ending the interview in a moment."}
              </AppSurfaceDescription>
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
          <div className="min-h-0 flex-1">{transcriptPanel}</div>
        </aside>
      </main>
    </div>
  );
}

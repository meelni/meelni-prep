import type { ReactNode } from "react";

import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";

export type FeedbackLabScenarioOption = Readonly<{
  id: string;
  label: string;
  expectedOutcome: string;
  source: "generated" | "lab";
}>;

export type FeedbackLabDiagnostics = Readonly<{
  artifactSchema: string;
  stageNames: readonly string[];
}>;

function outcomeLabel(outcome: string): string {
  return outcome.replaceAll("_", " ");
}

export function FeedbackLabShell({
  children,
  diagnostics,
  options,
  renderedOutcome,
  selected,
  onScenarioSelect,
}: {
  children: ReactNode;
  diagnostics: FeedbackLabDiagnostics;
  options: readonly FeedbackLabScenarioOption[];
  renderedOutcome: string;
  selected: FeedbackLabScenarioOption;
  onScenarioSelect: (scenarioId: string) => void;
}) {
  const outcomesMatch = selected.expectedOutcome === renderedOutcome;

  return (
    <div
      className="bg-dashboard-canvas min-h-dvh min-w-0 md:grid md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]"
      data-feedback-lab
      data-feedback-lab-expected-outcome={selected.expectedOutcome}
      data-feedback-lab-rendered-outcome={renderedOutcome}
    >
      <aside
        aria-labelledby="feedback-lab-title"
        className="border-border bg-background min-w-0 border-b p-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0 md:p-5"
      >
        <div className="space-y-5">
          <header className="space-y-2">
            <p className="text-primary text-xs font-semibold tracking-[0.16em] uppercase">
              Local test tooling
            </p>
            <h1
              id="feedback-lab-title"
              className="font-display text-foreground text-2xl font-light tracking-tight"
            >
              Feedback Lab
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              Inspect generated synthetic feedback through the customer review
              compositions. Nothing here creates customer or provider state.
            </p>
          </header>

          <nav aria-label="Feedback Lab scenarios">
            <p className="text-foreground mb-2 text-sm font-semibold">
              Synthetic scenarios
            </p>
            <ul className="space-y-2">
              {options.map((option) => {
                const current = option.id === selected.id;
                return (
                  <li key={option.id}>
                    <Button
                      type="button"
                      variant={current ? "secondary" : "outline"}
                      className="h-auto min-h-11 w-full min-w-0 justify-start px-3 py-2 text-left whitespace-normal"
                      aria-label={`${option.label}. Expected ${outcomeLabel(option.expectedOutcome)}`}
                      aria-pressed={current}
                      onClick={() => onScenarioSelect(option.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block wrap-anywhere">
                          {option.label}
                        </span>
                        <span className="text-foreground mt-0.5 block text-xs wrap-anywhere">
                          Expected: {outcomeLabel(option.expectedOutcome)}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <AppSurface
            size="sm"
            variant={outcomesMatch ? "muted" : "default"}
            className={outcomesMatch ? undefined : "border-destructive/50"}
          >
            <div className="space-y-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <AppSurfaceTitle className="text-sm">
                    Scenario details
                  </AppSurfaceTitle>
                  <AppSurfaceDescription>
                    Content-free artifact diagnostics
                  </AppSurfaceDescription>
                </div>
                <StatusPill
                  tone={outcomesMatch ? "success" : "danger"}
                  className={outcomesMatch ? "text-foreground" : undefined}
                >
                  {outcomesMatch ? "Matched" : "Mismatch"}
                </StatusPill>
              </div>

              <p
                className={
                  outcomesMatch
                    ? "text-muted-foreground text-xs leading-5"
                    : "text-destructive text-xs leading-5 font-medium"
                }
                role={outcomesMatch ? "status" : "alert"}
                aria-live={outcomesMatch ? "polite" : undefined}
                aria-atomic="true"
                data-feedback-lab-outcome-status
              >
                {outcomesMatch
                  ? "Generated expectation matches the rendered customer outcome."
                  : `Generated expectation is ${outcomeLabel(selected.expectedOutcome)}, but the customer renderer produced ${outcomeLabel(renderedOutcome)}.`}
              </p>

              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Scenario ID</dt>
                <dd className="text-foreground font-mono wrap-anywhere">
                  {selected.id}
                </dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="text-foreground wrap-anywhere">
                  {selected.source}
                </dd>
                <dt className="text-muted-foreground">Artifact</dt>
                <dd className="text-foreground font-mono wrap-anywhere">
                  {diagnostics.artifactSchema}
                </dd>
                <dt className="text-muted-foreground">Stages</dt>
                <dd className="text-foreground wrap-anywhere">
                  {diagnostics.stageNames.length > 0
                    ? diagnostics.stageNames.join(" → ")
                    : "Lab-owned state"}
                </dd>
              </dl>
            </div>
          </AppSurface>
        </div>
      </aside>

      <section
        aria-label={`Rendered customer feedback for ${selected.label}`}
        className="min-w-0"
        data-feedback-lab-preview
      >
        {children}
      </section>
    </div>
  );
}

import { useState } from "react";

import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "@/components/feedback/feedback-lifecycle-status";
import type { SavedInterviewWorkspace } from "@meelni/core";

import {
  FeedbackLabShell,
  type FeedbackLabScenarioOption,
} from "./feedback-lab-shell";

const LAB_SCENARIOS = [
  {
    id: "processing",
    label: "Processing saved interview",
    expectedOutcome: "processing",
    source: "lab",
  },
  {
    id: "loading",
    label: "Loading generated artifact",
    expectedOutcome: "loading",
    source: "lab",
  },
  {
    id: "malformed",
    label: "Malformed artifact fails closed",
    expectedOutcome: "unavailable",
    source: "lab",
  },
] as const satisfies readonly FeedbackLabScenarioOption[];

type LocalScenarioId = (typeof LAB_SCENARIOS)[number]["id"];

const PROCESSING_WORKSPACE = {
  version: "saved-interview.workspace.v1",
  saved: true,
  roundType: "product_sense",
  question: {
    text: "How would you prioritize a long list of competing synthetic customer needs while preserving a clear product strategy and explaining the evidence behind every tradeoff?",
    company: "Synthetic Product Company",
  },
  frozenTranscript: "ready",
} as const satisfies SavedInterviewWorkspace;

function initialScenarioId(): LocalScenarioId {
  const candidate = new URLSearchParams(window.location.search).get("lab");
  return LAB_SCENARIOS.some((scenario) => scenario.id === candidate)
    ? (candidate as LocalScenarioId)
    : LAB_SCENARIOS[0].id;
}

export function FeedbackLab() {
  const [scenarioId, setScenarioId] = useState(initialScenarioId);
  const selected =
    LAB_SCENARIOS.find((scenario) => scenario.id === scenarioId) ??
    LAB_SCENARIOS[0];

  const selectScenario = (nextScenarioId: string) => {
    const next = LAB_SCENARIOS.find(
      (scenario) => scenario.id === nextScenarioId
    );
    if (!next) return;

    const url = new URL(window.location.href);
    url.searchParams.set("lab", next.id);
    window.history.replaceState(null, "", url);
    setScenarioId(next.id);
  };

  return (
    <FeedbackLabShell
      diagnostics={{
        artifactSchema: "lab-owned-state.v1",
        stageNames: [],
      }}
      options={LAB_SCENARIOS}
      renderedOutcome={selected.expectedOutcome}
      selected={selected}
      onScenarioSelect={selectScenario}
    >
      <LocalFeedbackState scenarioId={selected.id} />
    </FeedbackLabShell>
  );
}

function LocalFeedbackState({ scenarioId }: { scenarioId: LocalScenarioId }) {
  if (scenarioId === "loading") return <FeedbackLoadingSkeleton />;

  if (scenarioId === "malformed") {
    return (
      <FeedbackLifecycleStatus
        state={{
          kind: "unavailable",
          message:
            "This generated feedback artifact could not be verified, so no customer feedback is shown.",
        }}
        recovering={false}
        recoveryError={null}
        onRecover={() => undefined}
      />
    );
  }

  return (
    <FeedbackLifecycleStatus
      state={{ kind: "processing", retryable: false, delayed: false }}
      workspace={PROCESSING_WORKSPACE}
      sessionId="feedback-lab-processing"
      recovering={false}
      recoveryError={null}
      onRecover={() => undefined}
    />
  );
}

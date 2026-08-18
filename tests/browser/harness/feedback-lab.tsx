import { useEffect, useState } from "react";

import {
  CompletedDimensionCoverageReview,
  CompletedEvidenceLimitedReview,
  CompletedLegacyReview,
  CompletedV2Review,
} from "@/components/feedback/feedback-completed-review";
import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "@/components/feedback/feedback-lifecycle-status";
import {
  toFeedbackViewState,
  type FeedbackCustomerProjection,
  type FeedbackLifecycleResponse,
  type FeedbackViewState,
  type SavedInterviewWorkspace,
} from "@meelni/core";
import {
  decodeSyntheticFeedbackArtifactV1,
  type SyntheticFeedbackArtifactV1,
} from "@meelni/test-fixtures/synthetic-feedback";

import type {
  FeedbackLabArtifactBundle,
  FeedbackLabArtifactEntry,
} from "./feedback-lab-artifacts";
import { loadGeneratedFeedbackLabArtifacts } from "./feedback-lab-generated";
import {
  FeedbackLabShell,
  type FeedbackLabDiagnostics,
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

const BUNDLE_FAILURE_SCENARIO = {
  id: "bundle-invalid",
  label: "Generated bundle fails closed",
  expectedOutcome: "unavailable",
  source: "lab",
} as const satisfies FeedbackLabScenarioOption;

type LocalScenarioId =
  | (typeof LAB_SCENARIOS)[number]["id"]
  | typeof BUNDLE_FAILURE_SCENARIO.id;
type LoadedBundle = FeedbackLabArtifactBundle | null | "loading";

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

function initialScenarioId(): string {
  return (
    new URLSearchParams(window.location.search).get("lab") ??
    "normal-product-sense"
  );
}

export function FeedbackLab() {
  const [scenarioId, setScenarioId] = useState(initialScenarioId);
  const [bundle, setBundle] = useState<LoadedBundle>("loading");

  useEffect(() => {
    let active = true;
    void loadGeneratedFeedbackLabArtifacts().then((loaded) => {
      if (active) setBundle(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const generatedEntries =
    bundle === "loading" || bundle === null ? [] : bundle.artifacts;
  const generatedOptions = generatedEntries.map((entry) => ({
    id: entry.artifact.scenario.id,
    label: entry.artifact.scenario.title,
    expectedOutcome: entry.artifact.scenario.expectedOutcome,
    source: "generated" as const,
  }));
  const options: readonly FeedbackLabScenarioOption[] =
    bundle === null
      ? [BUNDLE_FAILURE_SCENARIO, ...LAB_SCENARIOS]
      : [...generatedOptions, ...LAB_SCENARIOS];

  const fallback =
    bundle === "loading"
      ? LAB_SCENARIOS[1]
      : bundle === null
        ? BUNDLE_FAILURE_SCENARIO
        : (options[0] ?? LAB_SCENARIOS[2]);
  const selected =
    options.find((option) => option.id === scenarioId) ?? fallback;
  const generatedEntry = generatedEntries.find(
    (entry) => entry.artifact.scenario.id === selected.id
  );
  const renderedOutcome = generatedEntry
    ? (generatedEntry.projection?.outcome ?? "unavailable")
    : selected.expectedOutcome;
  const diagnostics = generatedEntry
    ? generatedDiagnostics(generatedEntry.artifact)
    : labDiagnostics(selected.id);

  const selectScenario = (nextScenarioId: string) => {
    if (!options.some((option) => option.id === nextScenarioId)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("lab", nextScenarioId);
    window.history.replaceState(null, "", url);
    setScenarioId(nextScenarioId);
  };

  return (
    <FeedbackLabShell
      diagnostics={diagnostics}
      options={options}
      renderedOutcome={renderedOutcome}
      selected={selected}
      onScenarioSelect={selectScenario}
    >
      {generatedEntry ? (
        <GeneratedFeedbackReview entry={generatedEntry} />
      ) : (
        <LocalFeedbackState scenarioId={selected.id as LocalScenarioId} />
      )}
    </FeedbackLabShell>
  );
}

function GeneratedFeedbackReview({
  entry,
}: {
  entry: FeedbackLabArtifactEntry;
}) {
  const { artifact, projection } = entry;
  if (!projection || projection.outcome === "unable_to_review") {
    return <GeneratedLifecycleReview lifecycle={artifact.customer.lifecycle} />;
  }
  return <GeneratedCompletedReview projection={projection} />;
}

function GeneratedCompletedReview({
  projection,
}: {
  projection: Exclude<
    FeedbackCustomerProjection,
    { outcome: "unable_to_review" }
  >;
}) {
  if (projection.outcome === "coaching_review") {
    const feedback = projection.review;
    return feedback.kind === "evidence-limited" ? (
      <CompletedEvidenceLimitedReview feedback={feedback} />
    ) : (
      <CompletedDimensionCoverageReview feedback={feedback} />
    );
  }
  const feedback = projection.review;
  if (feedback.kind === "v2") {
    return (
      <CompletedV2Review
        feedback={feedback}
        partial={feedback.evaluationState === "partial"}
      />
    );
  }
  if (feedback.kind === "legacy") {
    return <CompletedLegacyReview feedback={feedback} />;
  }
  return <CompletedDimensionCoverageReview feedback={feedback} />;
}

function GeneratedLifecycleReview({
  lifecycle,
}: {
  lifecycle: FeedbackLifecycleResponse;
}) {
  const state = toFeedbackViewState(lifecycle);
  if (isCompletedFeedbackState(state)) {
    return (
      <UnavailableFeedback message="This generated feedback artifact could not be projected safely." />
    );
  }
  return (
    <FeedbackLifecycleStatus
      state={state}
      recovering={false}
      recoveryError={null}
      onRecover={() => undefined}
    />
  );
}

function LocalFeedbackState({ scenarioId }: { scenarioId: LocalScenarioId }) {
  if (scenarioId === "loading") return <FeedbackLoadingSkeleton />;

  if (scenarioId === "processing") {
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

  if (scenarioId === "malformed") {
    const decoded = decodeSyntheticFeedbackArtifactV1({
      schemaVersion: "meelni.synthetic-feedback.artifact.unknown",
    });
    if (decoded) {
      return (
        <GeneratedFeedbackReview entry={impossibleDecodedEntry(decoded)} />
      );
    }
  }

  return (
    <UnavailableFeedback message="This generated feedback artifact could not be verified, so no customer feedback is shown." />
  );
}

function UnavailableFeedback({ message }: { message: string }) {
  return (
    <FeedbackLifecycleStatus
      state={{ kind: "unavailable", message }}
      recovering={false}
      recoveryError={null}
      onRecover={() => undefined}
    />
  );
}

function generatedDiagnostics(
  artifact: SyntheticFeedbackArtifactV1
): FeedbackLabDiagnostics {
  return {
    artifactSchema: artifact.schemaVersion,
    executionMode: artifact.diagnostics.executionMode,
    integrity: "sha256_verified",
    stageNames: artifact.stages,
  };
}

function labDiagnostics(scenarioId: string): FeedbackLabDiagnostics {
  return {
    artifactSchema:
      scenarioId === "bundle-invalid"
        ? "meelni.synthetic-feedback.manifest.v1"
        : "lab-owned-state.v1",
    executionMode: "provider_free_local",
    integrity: "lab_owned",
    stageNames: [],
  };
}

function isCompletedFeedbackState(
  state: FeedbackViewState
): state is Extract<
  FeedbackViewState,
  { kind: "completed-scorecard" | "completed-coaching-review" }
> {
  return (
    state.kind === "completed-scorecard" ||
    state.kind === "completed-coaching-review"
  );
}

function impossibleDecodedEntry(
  artifact: SyntheticFeedbackArtifactV1
): FeedbackLabArtifactEntry {
  throw new Error(
    `Unexpected malformed artifact decode: ${artifact.scenario.id}`
  );
}

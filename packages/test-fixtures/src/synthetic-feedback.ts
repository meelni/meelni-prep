import {
  decodeFeedbackLifecycleResponse,
  toFeedbackCustomerProjection,
  type FeedbackCustomerProjection,
  type FeedbackLifecycleResponse,
  type FeedbackViewState,
} from "@meelni/core";

import {
  createFeedbackGoldenPathFixtures,
  type FeedbackGoldenPathFixture,
} from "./feedback-generation";

export const SYNTHETIC_FEEDBACK_SCENARIO_VERSION =
  "meelni.synthetic-feedback.scenario.v1" as const;
export const SYNTHETIC_FEEDBACK_ARTIFACT_VERSION =
  "meelni.synthetic-feedback.artifact.v1" as const;
export const SYNTHETIC_FEEDBACK_MANIFEST_VERSION =
  "meelni.synthetic-feedback.manifest.v1" as const;

export const SYNTHETIC_FEEDBACK_GENERATED_STAGES = [
  "writer_registration",
  "transcript_ingest",
  "marker_ingest",
  "settlement_ingest",
  "end_frozen_evidence",
  "durable_dispatch",
  "evaluator",
  "immutable_persistence",
  "inngest_handler",
  "api_view_model",
] as const;

export const SYNTHETIC_FEEDBACK_SKIPPED_STAGES = [
  "writer_registration",
  "transcript_ingest",
  "marker_ingest",
  "settlement_ingest",
  "end_frozen_evidence",
  "api_view_model",
] as const;

export type SyntheticFeedbackStage =
  (typeof SYNTHETIC_FEEDBACK_GENERATED_STAGES)[number];
export type SyntheticFeedbackExpectedOutcome =
  | FeedbackCustomerProjection["outcome"]
  | "unavailable";
export type SyntheticFeedbackUnavailableView = Extract<
  FeedbackViewState,
  { kind: "unavailable" }
>;
export const SYNTHETIC_FEEDBACK_UNAVAILABLE_VIEW: SyntheticFeedbackUnavailableView =
  {
    kind: "unavailable",
    message: "Feedback returned an unsupported response.",
  };
export type SyntheticFeedbackCustomerView =
  | FeedbackCustomerProjection
  | SyntheticFeedbackUnavailableView;

export interface SyntheticFeedbackScenarioV1 {
  schemaVersion: typeof SYNTHETIC_FEEDBACK_SCENARIO_VERSION;
  id: string;
  title: string;
  expectedOutcome: SyntheticFeedbackExpectedOutcome;
  expectedStages: SyntheticFeedbackStage[];
  fixture: Omit<FeedbackGoldenPathFixture, "syntheticScenario">;
  evaluatorCoverage: "complete" | "sparse";
  persistedResultMutation: "none" | "unknown_schema_version";
  equivalenceGroup: string | null;
}

export interface SyntheticFeedbackReplayDiagnosticsV1 {
  writerRegistration: "existing";
  transcriptEvent: "existing" | "not_available";
  interruptionMarker: "existing" | "not_available";
  interviewEnd: "existing";
  dispatch: "already_sent" | "not_required";
  generation: "already_terminal" | "not_required";
  lateFailureApplied: false | "not_required";
  persistenceWrites: 0 | 1;
}

export interface SyntheticFeedbackArtifactV1 {
  schemaVersion: typeof SYNTHETIC_FEEDBACK_ARTIFACT_VERSION;
  scenario: {
    id: string;
    title: string;
    expectedOutcome: SyntheticFeedbackExpectedOutcome;
  };
  outcome: SyntheticFeedbackExpectedOutcome;
  stages: SyntheticFeedbackStage[];
  customer: {
    lifecycle: FeedbackLifecycleResponse;
    view: SyntheticFeedbackCustomerView;
  };
  diagnostics: {
    synthetic: true;
    sanitized: true;
    executionMode: "deterministic_provider_free" | "live_model_explicit_opt_in";
    durableStepRoundTrips: string[];
    replay: SyntheticFeedbackReplayDiagnosticsV1;
  };
}

export interface SyntheticFeedbackManifestEntryV1 {
  scenarioId: string;
  expectedOutcome: SyntheticFeedbackExpectedOutcome;
  stages: SyntheticFeedbackStage[];
  artifactFile: string;
  artifactSha256: string;
}

export interface SyntheticFeedbackManifestV1 {
  schemaVersion: typeof SYNTHETIC_FEEDBACK_MANIFEST_VERSION;
  artifacts: SyntheticFeedbackManifestEntryV1[];
}

export function createSyntheticFeedbackScenarios(): SyntheticFeedbackScenarioV1[] {
  return createFeedbackGoldenPathFixtures().flatMap((candidate) => {
    const metadata = candidate.syntheticScenario;
    if (!metadata) return [];
    const fixture = structuredClone(candidate);
    delete fixture.syntheticScenario;
    const expectedStages =
      metadata.expectedCustomerOutcome === "unable_to_review"
        ? [...SYNTHETIC_FEEDBACK_SKIPPED_STAGES]
        : [...SYNTHETIC_FEEDBACK_GENERATED_STAGES];
    return [
      {
        schemaVersion: SYNTHETIC_FEEDBACK_SCENARIO_VERSION,
        id: candidate.id,
        title: metadata.title,
        expectedOutcome: metadata.expectedCustomerOutcome,
        expectedStages,
        fixture,
        evaluatorCoverage: metadata.evaluatorCoverage ?? "complete",
        persistedResultMutation: metadata.persistedResultMutation ?? "none",
        equivalenceGroup: metadata.equivalenceGroup ?? null,
      },
    ];
  });
}

export function decodeSyntheticFeedbackArtifactV1(
  value: unknown
): SyntheticFeedbackArtifactV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "scenario",
      "outcome",
      "stages",
      "customer",
      "diagnostics",
    ]) ||
    value.schemaVersion !== SYNTHETIC_FEEDBACK_ARTIFACT_VERSION ||
    !isSyntheticFeedbackExpectedOutcome(value.outcome) ||
    !isSyntheticFeedbackStageArray(value.stages)
  ) {
    return null;
  }
  const scenario = decodeArtifactScenario(value.scenario);
  const customer = decodeArtifactCustomer(value.customer);
  const diagnostics = decodeArtifactDiagnostics(value.diagnostics);
  if (!scenario || !customer || !diagnostics) return null;
  const catalogScenario = findSyntheticFeedbackScenario(scenario.id);
  if (
    !catalogScenario ||
    catalogScenario.title !== scenario.title ||
    catalogScenario.expectedOutcome !== scenario.expectedOutcome ||
    !jsonEqual(catalogScenario.expectedStages, value.stages)
  ) {
    return null;
  }

  const projection = toFeedbackCustomerProjection(customer.lifecycle);
  const expectedView = projection ?? SYNTHETIC_FEEDBACK_UNAVAILABLE_VIEW;
  const outcome = projection?.outcome ?? "unavailable";
  if (
    !jsonEqual(customer.view, expectedView) ||
    value.outcome !== outcome ||
    scenario.expectedOutcome !== outcome ||
    !isArtifactExecutionCoherent(value.stages, customer, diagnostics)
  ) {
    return null;
  }

  return {
    schemaVersion: SYNTHETIC_FEEDBACK_ARTIFACT_VERSION,
    scenario,
    outcome,
    stages: [...value.stages],
    customer: { lifecycle: customer.lifecycle, view: expectedView },
    diagnostics,
  };
}

export function decodeSyntheticFeedbackManifestV1(
  value: unknown
): SyntheticFeedbackManifestV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "artifacts"]) ||
    value.schemaVersion !== SYNTHETIC_FEEDBACK_MANIFEST_VERSION ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0 ||
    value.artifacts.length > 100
  ) {
    return null;
  }
  const artifacts: SyntheticFeedbackManifestEntryV1[] = [];
  let previousScenarioId = "";
  for (const candidate of value.artifacts) {
    const artifact = decodeManifestEntry(candidate);
    if (!artifact || artifact.scenarioId <= previousScenarioId) return null;
    previousScenarioId = artifact.scenarioId;
    artifacts.push(artifact);
  }
  return {
    schemaVersion: SYNTHETIC_FEEDBACK_MANIFEST_VERSION,
    artifacts,
  };
}

function decodeArtifactScenario(
  value: unknown
): SyntheticFeedbackArtifactV1["scenario"] | null {
  return isRecord(value) &&
    hasExactKeys(value, ["id", "title", "expectedOutcome"]) &&
    isScenarioId(value.id) &&
    isBoundedString(value.title, 1, 160) &&
    isSyntheticFeedbackExpectedOutcome(value.expectedOutcome)
    ? {
        id: value.id,
        title: value.title,
        expectedOutcome: value.expectedOutcome,
      }
    : null;
}

function decodeArtifactCustomer(
  value: unknown
): SyntheticFeedbackArtifactV1["customer"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["lifecycle", "view"])) {
    return null;
  }
  const lifecycle = decodeFeedbackLifecycleResponse(value.lifecycle);
  if (
    !lifecycle ||
    (lifecycle.status !== "completed" && lifecycle.status !== "skipped") ||
    !jsonEqual(lifecycle, value.lifecycle)
  ) {
    return null;
  }
  return {
    lifecycle,
    view: value.view as SyntheticFeedbackCustomerView,
  };
}

function decodeArtifactDiagnostics(
  value: unknown
): SyntheticFeedbackArtifactV1["diagnostics"] | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "synthetic",
      "sanitized",
      "executionMode",
      "durableStepRoundTrips",
      "replay",
    ]) ||
    value.synthetic !== true ||
    value.sanitized !== true ||
    (value.executionMode !== "deterministic_provider_free" &&
      value.executionMode !== "live_model_explicit_opt_in") ||
    !isDurableStepRoundTrips(value.durableStepRoundTrips)
  ) {
    return null;
  }
  const replay = decodeReplayDiagnostics(value.replay);
  if (!replay) return null;
  return {
    synthetic: true,
    sanitized: true,
    executionMode: value.executionMode,
    durableStepRoundTrips: [...value.durableStepRoundTrips],
    replay,
  };
}

function decodeReplayDiagnostics(
  value: unknown
): SyntheticFeedbackReplayDiagnosticsV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "writerRegistration",
      "transcriptEvent",
      "interruptionMarker",
      "interviewEnd",
      "dispatch",
      "generation",
      "lateFailureApplied",
      "persistenceWrites",
    ]) ||
    value.writerRegistration !== "existing" ||
    (value.transcriptEvent !== "existing" &&
      value.transcriptEvent !== "not_available") ||
    (value.interruptionMarker !== "existing" &&
      value.interruptionMarker !== "not_available") ||
    value.interviewEnd !== "existing" ||
    (value.dispatch !== "already_sent" && value.dispatch !== "not_required") ||
    (value.generation !== "already_terminal" &&
      value.generation !== "not_required") ||
    (value.lateFailureApplied !== false &&
      value.lateFailureApplied !== "not_required") ||
    (value.persistenceWrites !== 0 && value.persistenceWrites !== 1)
  ) {
    return null;
  }
  return value as unknown as SyntheticFeedbackReplayDiagnosticsV1;
}

function decodeManifestEntry(
  value: unknown
): SyntheticFeedbackManifestEntryV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "scenarioId",
      "expectedOutcome",
      "stages",
      "artifactFile",
      "artifactSha256",
    ]) ||
    !isScenarioId(value.scenarioId) ||
    !isSyntheticFeedbackExpectedOutcome(value.expectedOutcome) ||
    !isSyntheticFeedbackStageArray(value.stages) ||
    value.artifactFile !== `${value.scenarioId}.json` ||
    typeof value.artifactSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.artifactSha256)
  ) {
    return null;
  }
  const scenario = findSyntheticFeedbackScenario(value.scenarioId);
  if (
    !scenario ||
    scenario.expectedOutcome !== value.expectedOutcome ||
    !jsonEqual(scenario.expectedStages, value.stages)
  ) {
    return null;
  }
  return {
    scenarioId: value.scenarioId,
    expectedOutcome: value.expectedOutcome,
    stages: [...value.stages],
    artifactFile: value.artifactFile,
    artifactSha256: value.artifactSha256,
  };
}

function findSyntheticFeedbackScenario(
  scenarioId: string
): SyntheticFeedbackScenarioV1 | null {
  return (
    createSyntheticFeedbackScenarios().find(
      (scenario) => scenario.id === scenarioId
    ) ?? null
  );
}

function isSyntheticFeedbackExpectedOutcome(
  value: unknown
): value is SyntheticFeedbackExpectedOutcome {
  return (
    value === "scorecard" ||
    value === "coaching_review" ||
    value === "unable_to_review" ||
    value === "unavailable"
  );
}

function isSyntheticFeedbackStageArray(
  value: unknown
): value is SyntheticFeedbackStage[] {
  return (
    jsonEqual(value, SYNTHETIC_FEEDBACK_GENERATED_STAGES) ||
    jsonEqual(value, SYNTHETIC_FEEDBACK_SKIPPED_STAGES)
  );
}

function isArtifactExecutionCoherent(
  stages: SyntheticFeedbackStage[],
  customer: SyntheticFeedbackArtifactV1["customer"],
  diagnostics: SyntheticFeedbackArtifactV1["diagnostics"]
): boolean {
  if (jsonEqual(stages, SYNTHETIC_FEEDBACK_SKIPPED_STAGES)) {
    return (
      customer.lifecycle.status === "skipped" &&
      diagnostics.durableStepRoundTrips.length === 0 &&
      diagnostics.replay.dispatch === "not_required" &&
      diagnostics.replay.generation === "not_required" &&
      diagnostics.replay.lateFailureApplied === "not_required" &&
      diagnostics.replay.persistenceWrites === 0
    );
  }
  return (
    customer.lifecycle.status === "completed" &&
    diagnostics.durableStepRoundTrips.length > 0 &&
    diagnostics.replay.dispatch === "already_sent" &&
    diagnostics.replay.generation === "already_terminal" &&
    diagnostics.replay.lateFailureApplied === false &&
    diagnostics.replay.persistenceWrites === 1
  );
}

function isScenarioId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 120 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isDurableStepRoundTrips(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        (/^(?:authorize|claim|fetch|complete)-feedback-generation$/.test(
          item
        ) ||
          item === "fetch-feedback-answer-blocks" ||
          item === "read-fenced-feedback-generation" ||
          /^read-current-feedback-evaluation-[1-9][0-9]*-execution-[0-9]+$/.test(
            item
          ) ||
          /^evaluate-feedback-attempt-[1-9][0-9]*$/.test(item) ||
          /^wait-feedback-evaluation-retry-[1-9][0-9]*$/.test(item))
    )
  );
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonEqual(item, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && jsonEqual(left[key], right[key])
    )
  );
}

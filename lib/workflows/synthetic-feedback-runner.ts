import { createHash } from "node:crypto";
import assert from "node:assert/strict";

import { toFeedbackCustomerProjection } from "@meelni/core";
import {
  SYNTHETIC_FEEDBACK_ARTIFACT_VERSION,
  SYNTHETIC_FEEDBACK_MANIFEST_VERSION,
  SYNTHETIC_FEEDBACK_UNAVAILABLE_VIEW,
  createSyntheticFeedbackScenarios,
  decodeSyntheticFeedbackArtifactV1,
  decodeSyntheticFeedbackManifestV1,
  type SyntheticFeedbackArtifactV1,
  type SyntheticFeedbackManifestV1,
  type SyntheticFeedbackScenarioV1,
} from "@meelni/test-fixtures/synthetic-feedback";

import {
  runFeedbackProductionScenario,
  type SyntheticFeedbackEvaluatorAdapter,
} from "./feedback-production-scenario";

export interface RunSyntheticFeedbackOptions {
  evaluator?: SyntheticFeedbackEvaluatorAdapter;
}

export interface SyntheticFeedbackBundleV1 {
  artifacts: Array<{
    artifact: SyntheticFeedbackArtifactV1;
    artifactFile: string;
    artifactJson: string;
    artifactSha256: string;
  }>;
  manifest: SyntheticFeedbackManifestV1;
  manifestJson: string;
}

export async function runSyntheticFeedbackScenario(
  scenarioId: string,
  options: RunSyntheticFeedbackOptions = {}
): Promise<SyntheticFeedbackArtifactV1> {
  const scenario = findSyntheticFeedbackScenario(scenarioId);
  const result = await runFeedbackProductionScenario(scenario.fixture, {
    evaluatorCoverage: scenario.evaluatorCoverage,
    ...(scenario.persistedResultMutation === "unknown_schema_version"
      ? { persistedResultMutation: scenario.persistedResultMutation }
      : {}),
    ...(options.evaluator ? { evaluator: options.evaluator } : {}),
  });
  const projection = toFeedbackCustomerProjection(result.lifecycle);
  const view = projection ?? SYNTHETIC_FEEDBACK_UNAVAILABLE_VIEW;
  const outcome = projection?.outcome ?? "unavailable";

  assert.equal(outcome, scenario.expectedOutcome, `${scenario.id}:outcome`);
  assert.deepEqual(
    result.stages,
    scenario.expectedStages,
    `${scenario.id}:stages`
  );

  const candidate: SyntheticFeedbackArtifactV1 = {
    schemaVersion: SYNTHETIC_FEEDBACK_ARTIFACT_VERSION,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      expectedOutcome: scenario.expectedOutcome,
    },
    outcome,
    stages: [...result.stages],
    customer: {
      lifecycle: result.lifecycle,
      view,
    },
    diagnostics: {
      synthetic: true,
      sanitized: true,
      executionMode: result.executionMode,
      durableStepRoundTrips: [...result.durableStepRoundTrips],
      replay: { ...result.replay },
    },
  };
  const decoded = decodeSyntheticFeedbackArtifactV1(jsonRoundTrip(candidate));
  assert.ok(decoded, `${scenario.id}:artifact_decode_failed`);
  return decoded;
}

export async function createSyntheticFeedbackBundle(
  scenarioIds?: readonly string[],
  options: RunSyntheticFeedbackOptions = {}
): Promise<SyntheticFeedbackBundleV1> {
  const catalog = createSyntheticFeedbackScenarios();
  const byId = new Map(catalog.map((scenario) => [scenario.id, scenario]));
  const selectedIds = scenarioIds?.length
    ? [...new Set(scenarioIds)].sort()
    : catalog.map((scenario) => scenario.id).sort();
  const selected = selectedIds.map((id) => {
    const scenario = byId.get(id);
    if (!scenario) throw new Error("unknown_synthetic_feedback_scenario");
    return scenario;
  });
  if (selected.length === 0) {
    throw new Error("synthetic_feedback_scenario_selection_empty");
  }

  const artifacts: SyntheticFeedbackBundleV1["artifacts"] = [];
  for (const scenario of selected) {
    const artifact = await runSyntheticFeedbackScenario(scenario.id, options);
    const artifactJson = serializeSyntheticFeedbackJson(artifact);
    artifacts.push({
      artifact,
      artifactFile: `${scenario.id}.json`,
      artifactJson,
      artifactSha256: sha256(artifactJson),
    });
  }

  const manifestCandidate: SyntheticFeedbackManifestV1 = {
    schemaVersion: SYNTHETIC_FEEDBACK_MANIFEST_VERSION,
    artifacts: artifacts.map((entry) => ({
      scenarioId: entry.artifact.scenario.id,
      expectedOutcome: entry.artifact.scenario.expectedOutcome,
      stages: [...entry.artifact.stages],
      artifactFile: entry.artifactFile,
      artifactSha256: entry.artifactSha256,
    })),
  };
  const manifest = decodeSyntheticFeedbackManifestV1(
    jsonRoundTrip(manifestCandidate)
  );
  assert.ok(manifest, "synthetic_feedback_manifest_decode_failed");
  return {
    artifacts,
    manifest,
    manifestJson: serializeSyntheticFeedbackJson(manifest),
  };
}

function findSyntheticFeedbackScenario(
  scenarioId: string
): SyntheticFeedbackScenarioV1 {
  const scenario = createSyntheticFeedbackScenarios().find(
    (candidate) => candidate.id === scenarioId
  );
  if (!scenario) throw new Error("unknown_synthetic_feedback_scenario");
  return scenario;
}

export function serializeSyntheticFeedbackJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

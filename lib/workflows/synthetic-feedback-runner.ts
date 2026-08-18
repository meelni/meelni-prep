import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

import type {
  FeedbackProductionScenarioResult,
  SyntheticFeedbackEvaluatorAdapter,
} from "./feedback-production-scenario";

type FeedbackProductionScenarioModule =
  typeof import("./feedback-production-scenario");

let productionScenarioModulePromise:
  | Promise<FeedbackProductionScenarioModule>
  | undefined;

export interface RunSyntheticFeedbackOptions {
  evaluator?: SyntheticFeedbackEvaluatorAdapter;
  workerEnvironment?: SyntheticFeedbackWorkerEnvironment;
}

export type SyntheticFeedbackWorkerEnvironment =
  | Readonly<{ NODE_ENV: "test"; TZ: "UTC" }>
  | Readonly<{
      MEELNI_REQUIRE_BROWSER_QA_EGRESS_GUARD: "1";
      NODE_ENV: "test";
      NODE_OPTIONS: string;
      TZ: "UTC";
    }>;

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
  const result = options.evaluator
    ? await runWithExplicitEvaluator(scenario, options.evaluator)
    : mustGetWorkerResult(
        await runProviderFreeWorker([scenario.id], options.workerEnvironment),
        scenario.id
      );
  return createSyntheticFeedbackArtifact(scenario, result);
}

function createSyntheticFeedbackArtifact(
  scenario: SyntheticFeedbackScenarioV1,
  result: FeedbackProductionScenarioResult
): SyntheticFeedbackArtifactV1 {
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
  const workerResults = options.evaluator
    ? null
    : await runProviderFreeWorker(
        selected.map((scenario) => scenario.id),
        options.workerEnvironment
      );
  for (const scenario of selected) {
    const artifact = workerResults
      ? createSyntheticFeedbackArtifact(
          scenario,
          mustGetWorkerResult(workerResults, scenario.id)
        )
      : await runSyntheticFeedbackScenario(scenario.id, options);
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

function loadProductionScenarioModule(): Promise<FeedbackProductionScenarioModule> {
  productionScenarioModulePromise ??= import("./feedback-production-scenario");
  return productionScenarioModulePromise;
}

async function runWithExplicitEvaluator(
  scenario: SyntheticFeedbackScenarioV1,
  evaluator: SyntheticFeedbackEvaluatorAdapter
): Promise<FeedbackProductionScenarioResult> {
  const { runFeedbackProductionScenario } =
    await loadProductionScenarioModule();
  return runFeedbackProductionScenario(scenario.fixture, {
    evaluatorCoverage: scenario.evaluatorCoverage,
    ...(scenario.persistedResultMutation === "unknown_schema_version"
      ? { persistedResultMutation: scenario.persistedResultMutation }
      : {}),
    evaluator,
  });
}

function runProviderFreeWorker(
  scenarioIds: readonly string[],
  workerEnvironment?: SyntheticFeedbackWorkerEnvironment
): Promise<Map<string, FeedbackProductionScenarioResult>> {
  const workerPath = fileURLToPath(
    new URL("./synthetic-feedback-worker.ts", import.meta.url)
  );
  const repositoryRoot = resolve(dirname(workerPath), "../..");
  return new Promise((resolveWorker, rejectWorker) => {
    execFile(
      process.execPath,
      ["--import", "tsx", workerPath, JSON.stringify(scenarioIds)],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: normalizeSyntheticFeedbackWorkerEnvironment(workerEnvironment),
        maxBuffer: 5 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          rejectWorker(new Error("synthetic_feedback_worker_failed"));
          return;
        }
        try {
          const entries = JSON.parse(stdout) as Array<{
            scenarioId: string;
            result: FeedbackProductionScenarioResult;
          }>;
          if (
            !Array.isArray(entries) ||
            entries.length !== scenarioIds.length
          ) {
            throw new Error("synthetic_feedback_worker_result_invalid");
          }
          const byId = new Map(
            entries.map((entry) => [entry.scenarioId, entry.result])
          );
          if (
            byId.size !== scenarioIds.length ||
            scenarioIds.some((scenarioId) => !byId.has(scenarioId))
          ) {
            throw new Error("synthetic_feedback_worker_result_invalid");
          }
          resolveWorker(byId);
        } catch {
          rejectWorker(new Error("synthetic_feedback_worker_result_invalid"));
        }
      }
    );
  });
}

function normalizeSyntheticFeedbackWorkerEnvironment(
  value?: SyntheticFeedbackWorkerEnvironment
): NodeJS.ProcessEnv {
  if (!value) return { NODE_ENV: "test", TZ: "UTC" };
  const keys = Object.keys(value).sort();
  const guarded = "NODE_OPTIONS" in value;
  if (
    value.NODE_ENV !== "test" ||
    value.TZ !== "UTC" ||
    (keys.length === 2 && keys.join(",") !== "NODE_ENV,TZ") ||
    (keys.length === 4 &&
      (keys.join(",") !==
        "MEELNI_REQUIRE_BROWSER_QA_EGRESS_GUARD,NODE_ENV,NODE_OPTIONS,TZ" ||
        !guarded ||
        value.MEELNI_REQUIRE_BROWSER_QA_EGRESS_GUARD !== "1" ||
        typeof value.NODE_OPTIONS !== "string" ||
        value.NODE_OPTIONS.length === 0)) ||
    (keys.length !== 2 && keys.length !== 4)
  ) {
    throw new Error("synthetic_feedback_worker_environment_invalid");
  }
  return { ...value };
}

function mustGetWorkerResult(
  results: ReadonlyMap<string, FeedbackProductionScenarioResult>,
  scenarioId: string
): FeedbackProductionScenarioResult {
  const result = results.get(scenarioId);
  assert.ok(result, `${scenarioId}:synthetic_worker_result_missing`);
  return result;
}

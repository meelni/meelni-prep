import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTHETIC_FEEDBACK_ARTIFACT_VERSION,
  createSyntheticFeedbackScenarios,
  decodeSyntheticFeedbackArtifactV1,
  decodeSyntheticFeedbackManifestV1,
  type SyntheticFeedbackExpectedOutcome,
} from "@meelni/test-fixtures";

import {
  createSyntheticFeedbackBundle,
  runSyntheticFeedbackScenario,
} from "./synthetic-feedback-runner";

const EXPECTED_SCENARIOS: ReadonlyMap<
  string,
  SyntheticFeedbackExpectedOutcome
> = new Map([
  ["normal-product-sense", "scorecard"],
  ["repeated-safe-markers-complete-scope", "scorecard"],
  ["excluded-unverified-tail", "coaching_review"],
  ["trustworthy-sparse-coverage", "coaching_review"],
  ["no-answer", "unable_to_review"],
  ["corrupt", "unable_to_review"],
  ["malformed-persisted-result", "unavailable"],
  ["segmentation-equivalent-1", "scorecard"],
  ["segmentation-equivalent-5", "scorecard"],
  ["replay-idempotency", "scorecard"],
] as const);

test("public scenario catalog is versioned, synthetic, and single-sourced", () => {
  const scenarios = createSyntheticFeedbackScenarios();
  assert.deepEqual(
    new Map(
      scenarios.map((scenario) => [scenario.id, scenario.expectedOutcome])
    ),
    EXPECTED_SCENARIOS
  );
  assert.doesNotThrow(() => JSON.stringify(scenarios));
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 10);
  assert.ok(
    scenarios.every(
      (scenario) =>
        scenario.schemaVersion === "meelni.synthetic-feedback.scenario.v1"
    )
  );
});

test("provider-free matrix emits deterministic terminal artifacts and manifest", async () => {
  const first = await createSyntheticFeedbackBundle();
  const second = await createSyntheticFeedbackBundle();
  assert.deepEqual(second, first);
  assert.equal(first.artifacts.length, EXPECTED_SCENARIOS.size);
  assert.deepEqual(
    first.manifest.artifacts.map((entry) => entry.scenarioId),
    [...EXPECTED_SCENARIOS.keys()].sort()
  );

  for (const entry of first.artifacts) {
    const artifact = entry.artifact;
    assert.equal(
      artifact.outcome,
      EXPECTED_SCENARIOS.get(artifact.scenario.id)
    );
    assert.ok(
      artifact.customer.lifecycle.status === "completed" ||
        artifact.customer.lifecycle.status === "skipped"
    );
    assert.equal(
      artifact.diagnostics.executionMode,
      "deterministic_provider_free"
    );
    assert.equal(
      entry.artifactSha256,
      createHash("sha256").update(entry.artifactJson).digest("hex")
    );
    assert.deepEqual(
      decodeSyntheticFeedbackArtifactV1(JSON.parse(entry.artifactJson)),
      artifact
    );
    assert.doesNotMatch(
      entry.artifactJson,
      /apiKey|apiSecret|databaseUrl|roomToken|providerPayload|creditState/
    );
  }
  assert.deepEqual(
    decodeSyntheticFeedbackManifestV1(JSON.parse(first.manifestJson)),
    first.manifest
  );
});

test("artifact and manifest decoders fail closed", async () => {
  const bundle = await createSyntheticFeedbackBundle(["normal-product-sense"]);
  const artifact = bundle.artifacts[0]!.artifact;

  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      schemaVersion: "meelni.synthetic-feedback.artifact.v999",
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      outcome: "coaching_review",
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      diagnostics: { ...artifact.diagnostics, providerPayload: {} },
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      scenario: { ...artifact.scenario, id: "unknown-synthetic-scenario" },
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      diagnostics: {
        ...artifact.diagnostics,
        durableStepRoundTrips: ["authorize-feedback-generation"],
      },
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      diagnostics: {
        ...artifact.diagnostics,
        replay: { ...artifact.diagnostics.replay, persistenceWrites: 0 },
      },
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackArtifactV1({
      ...artifact,
      customer: {
        ...artifact.customer,
        view: { ...artifact.customer.view, unexpected: true },
      },
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackManifestV1({
      ...bundle.manifest,
      artifacts: [
        { ...bundle.manifest.artifacts[0]!, artifactSha256: "not-a-hash" },
      ],
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackManifestV1({
      ...bundle.manifest,
      artifacts: [
        {
          ...bundle.manifest.artifacts[0]!,
          stages: bundle.manifest.artifacts[0]!.stages.slice(1),
        },
      ],
    }),
    null
  );
  assert.equal(
    decodeSyntheticFeedbackManifestV1({
      ...bundle.manifest,
      artifacts: [
        {
          ...bundle.manifest.artifacts[0]!,
          scenarioId: "unknown-synthetic-scenario",
          artifactFile: "unknown-synthetic-scenario.json",
        },
      ],
    }),
    null
  );
});

test("equivalent segmentations and safe-marker authority preserve scorecard semantics", async () => {
  const scenarios = createSyntheticFeedbackScenarios();
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const artifacts = await Promise.all(
    [
      "segmentation-equivalent-1",
      "segmentation-equivalent-5",
      "normal-product-sense",
      "repeated-safe-markers-complete-scope",
    ].map((id) => runSyntheticFeedbackScenario(byId.get(id)!))
  );

  assert.deepEqual(
    scorecardSemanticSignature(artifacts[0]!.customer.view),
    scorecardSemanticSignature(artifacts[1]!.customer.view)
  );
  assert.deepEqual(
    scorecardSemanticSignature(artifacts[2]!.customer.view),
    scorecardSemanticSignature(artifacts[3]!.customer.view)
  );
});

function scorecardSemanticSignature(value: unknown): unknown {
  assert.ok(isRecord(value) && value.outcome === "scorecard");
  assert.ok(isRecord(value.review));
  assert.equal(value.review.kind, "dimension-coverage");
  return removeIdentityFields(value.review);
}

function removeIdentityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeIdentityFields);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !["id", "sessionId", "createdAt", "transcriptRef"].includes(key)
      )
      .map(([key, entry]) => [key, removeIdentityFields(entry)])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

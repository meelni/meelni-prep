import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSyntheticFeedbackBundle } from "@/lib/workflows/synthetic-feedback-runner";

import { decodeFeedbackLabArtifactBundle } from "./feedback-lab-artifacts";

const sha256Text = async (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

test("decodes the complete generated bundle without reclassifying outcomes", async () => {
  const bundle = await createSyntheticFeedbackBundle();
  const decoded = await decodeFeedbackLabArtifactBundle({
    artifactJsonByFile: artifactFiles(bundle),
    manifestJson: bundle.manifestJson,
    sha256Text,
  });

  assert.ok(decoded);
  assert.equal(decoded.artifacts.length, 10);
  assert.deepEqual(
    new Set(decoded.artifacts.map((entry) => entry.projection?.outcome)),
    new Set(["scorecard", "coaching_review", "unable_to_review", undefined])
  );
  for (const entry of decoded.artifacts) {
    assert.equal(
      entry.projection?.outcome ?? "unavailable",
      entry.artifact.outcome
    );
  }
});

test("fails closed when artifact bytes do not match the manifest hash", async () => {
  const bundle = await createSyntheticFeedbackBundle(["normal-product-sense"]);
  const files = artifactFiles(bundle);
  files["normal-product-sense.json"] += " ";

  assert.equal(
    await decodeFeedbackLabArtifactBundle({
      artifactJsonByFile: files,
      manifestJson: bundle.manifestJson,
      sha256Text,
    }),
    null
  );
});

test("fails closed on a hash-valid cross-scenario payload transplant", async () => {
  const bundle = await createSyntheticFeedbackBundle([
    "normal-product-sense",
    "trustworthy-sparse-coverage",
  ]);
  const files = artifactFiles(bundle);
  files["normal-product-sense.json"] =
    files["trustworthy-sparse-coverage.json"];
  const manifest = structuredClone(bundle.manifest);
  const entry = manifest.artifacts.find(
    (candidate) => candidate.scenarioId === "normal-product-sense"
  );
  assert.ok(entry);
  entry.artifactSha256 = await sha256Text(files[entry.artifactFile]);

  assert.equal(
    await decodeFeedbackLabArtifactBundle({
      artifactJsonByFile: files,
      manifestJson: JSON.stringify(manifest),
      sha256Text,
    }),
    null
  );
});

test("fails closed on malformed JSON, unknown schema, or extra files", async () => {
  const bundle = await createSyntheticFeedbackBundle(["normal-product-sense"]);
  const original = artifactFiles(bundle);

  assert.equal(
    await decodeFeedbackLabArtifactBundle({
      artifactJsonByFile: {
        ...original,
        "normal-product-sense.json": "{",
      },
      manifestJson: bundle.manifestJson,
      sha256Text,
    }),
    null
  );

  const unknownSchema = JSON.parse(
    original["normal-product-sense.json"]
  ) as Record<string, unknown>;
  unknownSchema.schemaVersion = "meelni.synthetic-feedback.artifact.v2";
  const unknownSchemaJson = JSON.stringify(unknownSchema);
  const unknownSchemaManifest = structuredClone(bundle.manifest);
  unknownSchemaManifest.artifacts[0].artifactSha256 =
    await sha256Text(unknownSchemaJson);
  assert.equal(
    await decodeFeedbackLabArtifactBundle({
      artifactJsonByFile: {
        "normal-product-sense.json": unknownSchemaJson,
      },
      manifestJson: JSON.stringify(unknownSchemaManifest),
      sha256Text,
    }),
    null
  );

  assert.equal(
    await decodeFeedbackLabArtifactBundle({
      artifactJsonByFile: { ...original, "unexpected.json": "{}" },
      manifestJson: bundle.manifestJson,
      sha256Text,
    }),
    null
  );
});

function artifactFiles(
  bundle: Awaited<ReturnType<typeof createSyntheticFeedbackBundle>>
): Record<string, string> {
  return Object.fromEntries(
    bundle.artifacts.map((entry) => [entry.artifactFile, entry.artifactJson])
  );
}

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSyntheticFeedbackArtifactV1,
  decodeSyntheticFeedbackManifestV1,
} from "@meelni/test-fixtures/synthetic-feedback";

import { runSyntheticFeedbackCli } from "./run-synthetic-feedback";

test("list command exposes deterministic scenario metadata without running", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runSyntheticFeedbackCli(["list"], {
    cwd: process.cwd(),
    writeOut: (value) => output.push(value),
    writeError: (value) => errors.push(value),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  const scenarios = JSON.parse(output.join("")) as Array<{
    id: string;
    expectedOutcome: string;
    stages: string[];
  }>;
  assert.equal(scenarios.length, 10);
  assert.ok(scenarios.every((scenario) => scenario.stages.length > 0));
});

test("run command writes a decodable artifact and hash-bound manifest", async (t) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "meelni-synthetic-feedback-")
  );
  const outputDirectory = join(temporaryRoot, "output");
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outputs: string[] = [];
  const errors: string[] = [];
  const args = ["run", "normal-product-sense", "--output", outputDirectory];
  assert.equal(
    await runSyntheticFeedbackCli(args, {
      cwd: process.cwd(),
      writeOut: (value) => outputs.push(value),
      writeError: (value) => errors.push(value),
    }),
    0
  );
  assert.deepEqual(errors, []);

  const artifactJson = await readFile(
    join(outputDirectory, "normal-product-sense.json"),
    "utf8"
  );
  const manifestJson = await readFile(
    join(outputDirectory, "manifest.json"),
    "utf8"
  );
  const artifact = decodeSyntheticFeedbackArtifactV1(JSON.parse(artifactJson));
  const manifest = decodeSyntheticFeedbackManifestV1(JSON.parse(manifestJson));
  assert.ok(artifact);
  assert.ok(manifest);
  assert.equal(artifact.outcome, "scorecard");
  assert.equal(
    manifest.artifacts[0]?.artifactSha256,
    createHash("sha256").update(artifactJson).digest("hex")
  );

  const firstArtifact = artifactJson;
  const firstManifest = manifestJson;
  assert.equal(
    await runSyntheticFeedbackCli(args, {
      cwd: process.cwd(),
      writeOut: () => undefined,
      writeError: (value) => assert.fail(value),
    }),
    0
  );
  assert.equal(
    await readFile(join(outputDirectory, "normal-product-sense.json"), "utf8"),
    firstArtifact
  );
  assert.equal(
    await readFile(join(outputDirectory, "manifest.json"), "utf8"),
    firstManifest
  );
});

test("run command rejects unknown scenarios and filesystem-root output", async () => {
  const errors: string[] = [];
  const io = {
    cwd: process.cwd(),
    writeOut: () => undefined,
    writeError: (value: string) => errors.push(value),
  };
  assert.equal(await runSyntheticFeedbackCli(["run", "not-a-scenario"], io), 1);
  assert.match(errors.at(-1) ?? "", /unknown_synthetic_feedback_scenario/);
  assert.equal(
    await runSyntheticFeedbackCli(["run", "--all", "--output", "/"], io),
    1
  );
  assert.match(errors.at(-1) ?? "", /cannot_be_filesystem_root/);
  assert.equal(
    await runSyntheticFeedbackCli(
      ["run", "normal-product-sense", "--output", "--misspelled-flag"],
      io
    ),
    1
  );
  assert.match(errors.at(-1) ?? "", /usage: feedback:synthetic/);
});

test("run command preserves mismatched output and rejects symlinks", async (t) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "meelni-synthetic-feedback-safety-")
  );
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const errors: string[] = [];
  const io = {
    cwd: process.cwd(),
    writeOut: () => undefined,
    writeError: (value: string) => errors.push(value),
  };

  const mismatchedOutput = join(temporaryRoot, "mismatched");
  await mkdir(mismatchedOutput);
  const existingManifest = join(mismatchedOutput, "manifest.json");
  await writeFile(existingManifest, "preserve-me\n", "utf8");
  assert.equal(
    await runSyntheticFeedbackCli(
      ["run", "normal-product-sense", "--output", mismatchedOutput],
      io
    ),
    1
  );
  assert.equal(await readFile(existingManifest, "utf8"), "preserve-me\n");
  assert.match(errors.at(-1) ?? "", /synthetic_feedback_output_conflict/);

  const symlinkTarget = join(temporaryRoot, "symlink-target");
  const symlinkOutput = join(temporaryRoot, "symlink-output");
  await mkdir(symlinkTarget);
  await symlink(symlinkTarget, symlinkOutput, "dir");
  assert.equal(
    await runSyntheticFeedbackCli(
      ["run", "normal-product-sense", "--output", symlinkOutput],
      io
    ),
    1
  );
  assert.deepEqual(await readdir(symlinkTarget), []);
  assert.match(errors.at(-1) ?? "", /synthetic_feedback_output_conflict/);
});

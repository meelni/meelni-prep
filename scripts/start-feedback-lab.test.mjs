import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  createFeedbackLabEnvironment,
  FEEDBACK_LAB_ARTIFACT_DIRECTORY,
  feedbackLabGenerationCommand,
  resetFeedbackLabArtifactDirectory,
} from "./start-feedback-lab.mjs";

test("Feedback Lab strips provider credentials and blocks server egress", () => {
  const environment = createFeedbackLabEnvironment(
    {
      CI: "true",
      HOME: "/tmp/feedback-lab-home",
      PATH: "/usr/bin",
      LIVEKIT_API_SECRET: "must-not-cross-boundary",
      OPENAI_API_KEY: "must-not-cross-boundary",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-cross-boundary",
    },
    "/tmp/feedback-lab"
  );

  assert.equal(environment.CI, "true");
  assert.equal(environment.HOME, "/tmp/feedback-lab-home");
  assert.equal(environment.LIVEKIT_API_SECRET, undefined);
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(environment.NODE_ENV, "test");
  assert.match(environment.NODE_OPTIONS, /block-server-egress\.mjs/);
});

test("Feedback Lab invokes the provider-free deterministic matrix", () => {
  const generation = feedbackLabGenerationCommand("/tmp/repository");
  assert.deepEqual(generation.args, [
    "run",
    "feedback:synthetic",
    "--",
    "run",
    "--all",
    "--output",
    FEEDBACK_LAB_ARTIFACT_DIRECTORY,
  ]);
});

test("Feedback Lab lets the synthetic publisher claim a missing output directory", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "meelni-feedback-lab-"));
  const artifactDirectory = join(repoRoot, FEEDBACK_LAB_ARTIFACT_DIRECTORY);
  await mkdir(artifactDirectory, { recursive: true });

  try {
    assert.equal(
      await resetFeedbackLabArtifactDirectory(repoRoot),
      artifactDirectory
    );
    await assert.rejects(access(artifactDirectory));
    await access(dirname(artifactDirectory));
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

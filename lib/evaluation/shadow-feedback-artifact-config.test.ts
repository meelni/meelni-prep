import assert from "node:assert/strict";
import test from "node:test";

import {
  getShadowFeedbackArtifactStorageGate,
  isShadowFeedbackArtifactStorageEnabledContext,
} from "./shadow-feedback-artifact-config";

test("shadow artifact storage is default-off and unknown values fail closed", () => {
  assert.deepEqual(gateFor(undefined), {
    enabled: false,
    reason: "default_off",
  });
  assert.deepEqual(gateFor("true"), {
    enabled: false,
    reason: "invalid_config",
  });
  assert.deepEqual(gateFor(" enabled "), {
    enabled: false,
    reason: "invalid_config",
  });
});

test("only the exact enabled value mints a validated storage context", () => {
  const gate = gateFor("enabled");
  assert.equal(gate.enabled, true);
  assert.equal(
    gate.enabled && isShadowFeedbackArtifactStorageEnabledContext(gate.context),
    true
  );
  assert.equal(
    isShadowFeedbackArtifactStorageEnabledContext({ enabled: true }),
    false
  );
});

function gateFor(value: string | undefined) {
  const previous = process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
  if (value === undefined) {
    delete process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
  } else {
    process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE = value;
  }
  try {
    return getShadowFeedbackArtifactStorageGate();
  } finally {
    if (previous === undefined) {
      delete process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
    } else {
      process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE = previous;
    }
  }
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  getShadowFeedbackArtifactStorageGate,
  isShadowFeedbackArtifactStorageEnabledContext,
} from "./shadow-feedback-artifact-config";

test("shadow artifact storage is default-off and unknown values fail closed", () => {
  assert.deepEqual(getShadowFeedbackArtifactStorageGate({}), {
    enabled: false,
    reason: "default_off",
  });
  assert.deepEqual(
    getShadowFeedbackArtifactStorageGate({
      MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE: "true",
    }),
    { enabled: false, reason: "invalid_config" }
  );
  assert.deepEqual(
    getShadowFeedbackArtifactStorageGate({
      MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE: " enabled ",
    }),
    { enabled: false, reason: "invalid_config" }
  );
});

test("only the exact enabled value mints a validated storage context", () => {
  const gate = getShadowFeedbackArtifactStorageGate({
    MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE: "enabled",
  });
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  getShadowFeedbackExecutionGate,
  isShadowFeedbackExecutionEnabledContext,
} from "./shadow-feedback-execution-config";

test("shadow execution is default-off and unknown values fail closed", () => {
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

test("only the exact process value mints an opaque execution context", () => {
  const gate = gateFor("enabled");
  assert.equal(gate.enabled, true);
  assert.equal(
    gate.enabled && isShadowFeedbackExecutionEnabledContext(gate.context),
    true
  );
  assert.equal(
    isShadowFeedbackExecutionEnabledContext({ enabled: true }),
    false
  );
});

function gateFor(value: string | undefined) {
  const previous = process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
  if (value === undefined) {
    delete process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
  } else {
    process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION = value;
  }
  try {
    return getShadowFeedbackExecutionGate();
  } finally {
    if (previous === undefined) {
      delete process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
    } else {
      process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION = previous;
    }
  }
}

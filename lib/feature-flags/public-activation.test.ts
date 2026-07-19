import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_ACTIVATION_PAUSED_DESCRIPTION,
  PUBLIC_ACTIVATION_PAUSED_LABEL,
  resolvePublicActivationDecision,
} from "./public-activation";

test("public activation resolves the relaunch-off state without an activation path", () => {
  assert.deepEqual(resolvePublicActivationDecision(false), {
    canActivate: false,
    state: "paused",
  });
  assert.equal(PUBLIC_ACTIVATION_PAUSED_LABEL, "Practice currently paused");
  assert.match(PUBLIC_ACTIVATION_PAUSED_DESCRIPTION, /not accepting new/i);
});

test("public activation preserves the enabled conversion path", () => {
  assert.deepEqual(resolvePublicActivationDecision(true), {
    canActivate: true,
    state: "available",
  });
});

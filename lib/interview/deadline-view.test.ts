import assert from "node:assert/strict";
import test from "node:test";

import { canNavigateToInterviewFeedback } from "./deadline-view";

test("durable end truth hands presentation to feedback before dispatch is ready", () => {
  for (const lifecycleState of ["ending", "completed", "abandoned", "failed"]) {
    assert.equal(
      canNavigateToInterviewFeedback({
        lifecycleState,
      }),
      true,
      lifecycleState
    );
  }
});

test("joinable lifecycle truth stays in the focused interview room", () => {
  for (const lifecycleState of [
    "created",
    "connecting",
    "active",
    "reconnecting",
  ]) {
    assert.equal(
      canNavigateToInterviewFeedback({
        lifecycleState,
      }),
      false,
      lifecycleState
    );
  }
});

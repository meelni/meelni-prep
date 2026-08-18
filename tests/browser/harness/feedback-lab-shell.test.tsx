import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedbackLabShell } from "./feedback-lab-shell";

test("generated expectation and rendered outcome divergence fails visibly", () => {
  const html = renderToStaticMarkup(
    <FeedbackLabShell
      diagnostics={{
        artifactSchema: "meelni.synthetic-feedback.artifact.v1",
        executionMode: "deterministic_provider_free",
        integrity: "sha256_verified",
        stageNames: ["validate", "project"],
      }}
      options={[
        {
          id: "synthetic-scorecard",
          label: "Synthetic scorecard",
          expectedOutcome: "scorecard",
          source: "generated",
        },
      ]}
      renderedOutcome="coaching_review"
      selected={{
        id: "synthetic-scorecard",
        label: "Synthetic scorecard",
        expectedOutcome: "scorecard",
        source: "generated",
      }}
      onScenarioSelect={() => undefined}
    >
      <div>Customer feedback preview</div>
    </FeedbackLabShell>
  );

  assert.match(html, /data-feedback-lab-expected-outcome="scorecard"/);
  assert.match(html, /data-feedback-lab-rendered-outcome="coaching_review"/);
  assert.match(html, /role="alert"/);
  assert.match(
    html,
    /Generated expectation is scorecard, but the customer renderer produced coaching review\./
  );
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /min-h-11/);
  assert.match(html, /SHA-256 verified/);
  assert.match(html, /deterministic_provider_free/);
});

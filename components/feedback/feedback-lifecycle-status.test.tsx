import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedbackLifecycleStatus } from "./feedback-lifecycle-status";

test("retryable processing remains visibly processing while recovery is available", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: true },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Reviewing your interview/);
  assert.match(html, /Restart review/);
  assert.doesNotMatch(html, /waiting to start/i);
});

test("settling explains that feedback will begin after safe session closure", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "settling",
        message: "The interview is saved and its room is still closing safely.",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Saving your interview/);
  assert.match(html, /begin automatically/);
  assert.doesNotMatch(html, /Queue feedback/);
});

test("invalid completed feedback exposes no inferred score", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "completed-invalid" },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /No score has been inferred/);
  assert.doesNotMatch(html, /0\.0/);
  assert.doesNotMatch(html, /Transcript evidence/);
  assert.doesNotMatch(html, /invented quote/);
});

test("unsupported lifecycle payloads render an explicit unavailable state", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "unavailable",
        message: "Feedback returned an unsupported response.",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Feedback unavailable/);
  assert.match(html, /unsupported response/);
  assert.doesNotMatch(html, /Loading your saved feedback/);
});

for (const { name, stats } of [
  {
    name: "duration-only insufficiency",
    stats: {
      totalTurns: 6,
      userTurns: 3,
      totalWords: 180,
      durationSeconds: 240,
      substantiveResponses: 3,
    },
  },
  {
    name: "turn-count-only insufficiency",
    stats: {
      totalTurns: 4,
      userTurns: 3,
      totalWords: 180,
      durationSeconds: 360,
      substantiveResponses: 3,
    },
  },
]) {
  test(`uses threshold-neutral copy for ${name}`, () => {
    const html = renderToStaticMarkup(
      React.createElement(FeedbackLifecycleStatus, {
        state: {
          kind: "skipped-insufficient",
          details: {
            tier: "insufficient",
            reasons: [],
            recommendations: [],
            stats,
          },
        },
        recovering: false,
        recoveryError: null,
        onRecover() {},
      })
    );

    assert.match(
      html,
      /The recorded interview did not meet the minimum evidence threshold for honest scores\./
    );
    assert.doesNotMatch(html, /not enough substantive answers/i);
  });
}

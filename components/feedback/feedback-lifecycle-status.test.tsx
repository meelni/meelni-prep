import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedbackLifecycleStatus } from "./feedback-lifecycle-status";

test("retryable processing remains visibly processing while recovery is available", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: true, delayed: false },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Reviewing your interview/);
  assert.match(html, /Restart review/);
  assert.doesNotMatch(html, /waiting to start/i);
});

test("delayed processing explains that the saved interview remains available", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: false, delayed: true },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Feedback is taking longer/);
  assert.match(html, /interview is saved/i);
  assert.match(html, /Interview history/);
  assert.match(html, /href="\/dashboard\/history"/);
});

test("delayed settling offers a direct retry without trapping the customer", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "settling",
        retryable: true,
        delayed: true,
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Interview saving is delayed/);
  assert.match(html, /Retry saving/);
  assert.match(html, /View interview history/);
});

test("settling explains that feedback will begin after safe session closure", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "settling",
        retryable: false,
        delayed: false,
        message: "The interview is saved and its room is still closing safely.",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Saving your interview/);
  assert.match(html, /feedback starts automatically/i);
  assert.match(html, /View interview history/);
  assert.match(html, /href="\/dashboard\/history"/);
  assert.doesNotMatch(html, /Queue feedback/);
});

test("poll exhaustion is explicitly paused and no longer busy", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: false, delayed: true },
      recovering: false,
      recoveryError: null,
      pollingPaused: true,
      pausedMessage:
        "We couldn’t check your feedback just now. Your interview is saved, and automatic checking is paused.",
      onRecover() {},
    })
  );
  assert.match(html, /Automatic checking paused/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /Check again/);
  assert.match(html, /View interview history/);
  assert.match(html, /href="\/dashboard\/history"/);
  assert.doesNotMatch(html, /animate-spin/);
  assert.doesNotMatch(html, /updates automatically/i);
});

test("an active owned session links to its canonical interview URL", () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "session-active",
        message: "This interview has not ended yet.",
      },
      recovering: false,
      recoveryError: null,
      sessionId,
      onRecover() {},
    })
  );
  assert.match(html, new RegExp(`href="/interview\\?sessionId=${sessionId}"`));
  assert.doesNotMatch(html, /history\.back/);
});

test("retryable failure exposes recovery instead of an indefinite loading state", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "failed-retryable",
        message: "The saved interview is ready to retry.",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(html, /Feedback review failed/);
  assert.match(html, /Try feedback again/);
  assert.doesNotMatch(html, /Loading your saved feedback/);
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

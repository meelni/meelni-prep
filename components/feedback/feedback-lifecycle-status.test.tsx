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
        outcomeReason: "generation_failed",
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

test("dispatch failure remains a truthful actionable system state", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "dispatch-failed",
        retryable: true,
        message: "Your interview is saved, but feedback could not be queued.",
        outcomeReason: "dispatch_failed",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Feedback could not be queued/);
  assert.match(html, /interview is saved/i);
  assert.match(html, /Queue feedback again/);
  assert.match(html, /Back to dashboard/);
  assert.doesNotMatch(
    html,
    /provider|model|duration|microphone|answer quality|try harder/i
  );
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

for (const outcomeReason of [
  "no_reviewable_answer",
  "transcript_integrity_degraded",
] as const) {
  test(`uses system-safe copy for ${outcomeReason}`, () => {
    const html = renderToStaticMarkup(
      React.createElement(FeedbackLifecycleStatus, {
        state: {
          kind:
            outcomeReason === "transcript_integrity_degraded"
              ? "transcript-integrity-degraded"
              : "no-reviewable-answer",
          details: {
            outcomeReason,
            tier: "insufficient",
            reasons: [],
            recommendations: [],
          },
        },
        recovering: false,
        recoveryError: null,
        onRecover() {},
      })
    );

    assert.match(
      html,
      outcomeReason === "transcript_integrity_degraded"
        ? /saved transcript could not be verified/i
        : /saved interview does not contain a reviewable candidate answer/i
    );
    assert.doesNotMatch(html, /duration|microphone|try harder|answer length/i);
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FeedbackLifecycleStatus,
  FeedbackLoadingSkeleton,
} from "./feedback-lifecycle-status";

const SAVED_WORKSPACE = {
  version: "saved-interview.workspace.v1",
  saved: true,
  roundType: "product_sense",
  question: {
    text: "How would you improve a synthetic planning product?",
    company: "Synthetic Co",
  },
  frozenTranscript: "ready",
} as const;

test("loading and standalone lifecycle updates use atomic polite status regions", () => {
  const loading = renderToStaticMarkup(
    React.createElement(FeedbackLoadingSkeleton)
  );
  const processing = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: false, delayed: false },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  for (const status of [loading, processing]) {
    assert.match(status, /role="status"/);
    assert.match(status, /aria-live="polite"/);
    assert.match(status, /aria-atomic="true"/);
  }
});

test("processing keeps saved interview context and frozen transcript access visible", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: false, delayed: false },
      workspace: SAVED_WORKSPACE,
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Interview saved/);
  assert.match(html, /Product Sense mock interview/);
  assert.match(html, /synthetic planning product/);
  assert.match(html, /Synthetic Co/);
  assert.match(html, /Saved interview transcript/);
  assert.match(html, /Only finalized saved evidence is shown/);
  assert.match(html, /aria-current="step"/);
  assert.doesNotMatch(html, /score|provider/i);
  const liveRegion = stageLiveRegion(html);
  assert.match(liveRegion, /Reviewing your interview/);
  assert.match(liveRegion, /aria-atomic="true"/);
  assert.doesNotMatch(liveRegion, /synthetic planning product/);
  assert.doesNotMatch(liveRegion, /Saved interview transcript/);
});

test("settling never offers transcript access before frozen evidence is ready", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "settling", retryable: false, delayed: false },
      workspace: { ...SAVED_WORKSPACE, frozenTranscript: "pending" },
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Finalized transcript is still being prepared/);
  assert.doesNotMatch(html, /Expand interview transcript/);
  assert.doesNotMatch(html, /transcript could not be loaded/i);
});

test("paused saved workspace keeps context without claiming active work", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "processing", retryable: false, delayed: true },
      workspace: SAVED_WORKSPACE,
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      recovering: false,
      recoveryError: null,
      pollingPaused: true,
      onRecover() {},
    })
  );

  assert.match(html, /Automatic checking paused/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /Check again/);
  assert.match(html, /Saved interview transcript/);
  assert.doesNotMatch(html, /animate-spin/);
  const liveRegion = stageLiveRegion(html);
  assert.match(liveRegion, /Automatic checking paused/);
  assert.match(liveRegion, /aria-busy="false"/);
  assert.doesNotMatch(liveRegion, /Saved interview transcript/);
});

test("stage rerenders keep context and transcript outside the live region", () => {
  const render = (pollingPaused: boolean) =>
    renderToStaticMarkup(
      React.createElement(FeedbackLifecycleStatus, {
        state: { kind: "processing", retryable: false, delayed: pollingPaused },
        workspace: SAVED_WORKSPACE,
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        recovering: false,
        recoveryError: null,
        pollingPaused,
        onRecover() {},
      })
    );

  for (const html of [render(false), render(true)]) {
    const liveRegion = stageLiveRegion(html);
    assert.doesNotMatch(liveRegion, /synthetic planning product/);
    assert.doesNotMatch(liveRegion, /Synthetic Co/);
    assert.doesNotMatch(liveRegion, /Saved interview transcript/);
    assert.match(html, /synthetic planning product/);
    assert.match(html, /Saved interview transcript/);
  }
});

test("settling with unavailable evidence marks only feedback review current", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: { kind: "settling", retryable: false, delayed: true },
      workspace: { ...SAVED_WORKSPACE, frozenTranscript: "unavailable" },
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.equal(html.match(/aria-current="step"/g)?.length, 1);
  assert.match(html, /Finalized transcript<\/p><p[^>]*>Unavailable<\/p>/);
  assert.match(html, /aria-current="step"[^>]*>[\s\S]*?Feedback review/);
});

function stageLiveRegion(html: string): string {
  const marker = html.indexOf("data-feedback-stage-status");
  assert.notEqual(marker, -1);
  const start = html.lastIndexOf("<div", marker);
  assert.notEqual(start, -1);
  const end = html.indexOf("</div>", marker);
  assert.notEqual(end, -1);
  return html.slice(start, end);
}

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
  assert.match(html, /Unable to review/);
  assert.match(html, /no scores, coaching, or performance conclusion/i);
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
        state:
          outcomeReason === "transcript_integrity_degraded"
            ? {
                kind: "transcript-integrity-degraded",
                retryable: false,
                details: {
                  outcome: "unable_to_review",
                  scoreWithheldReason: "verified_evidence_integrity",
                  recovery: "credit_recovery_in_progress",
                },
              }
            : {
                kind: "no-reviewable-answer",
                details: {
                  outcome: "unable_to_review",
                  scoreWithheldReason: "rubric_coverage",
                  recovery: "start_another_interview",
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
        ? /could not verify the saved interview evidence/i
        : /saved interview did not contain enough verified candidate-answer evidence/i
    );
    assert.match(html, /Unable to review/);
    if (outcomeReason === "transcript_integrity_degraded") {
      assert.match(html, /does not reflect your performance/i);
      assert.match(html, /Credit recovery is in progress/);
      assert.match(html, /Start another mock interview/);
    } else {
      assert.match(html, /Start a new mock interview/);
    }
    assert.doesNotMatch(html, /duration|microphone|try harder|answer length/i);
  });
}

test("integrity failure confirms a returned credit without exposing internals", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "transcript-integrity-degraded",
        retryable: false,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "verified_evidence_integrity",
          recovery: "credit_returned",
        },
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Your interview credit was returned/);
  assert.match(html, /use it for another mock interview/);
  assert.doesNotMatch(html, /provider|model|settlement|refund_action|code/i);
});

test("recoverable integrity review offers a credit-safe retry", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "transcript-integrity-degraded",
        retryable: true,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "verified_evidence_integrity",
          recovery: "review_recovery_available",
        },
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Review ready to retry/);
  assert.match(html, /saved interview is intact/i);
  assert.match(html, /Retry review/);
  assert.match(html, /does not use another interview credit/i);
  assert.doesNotMatch(html, /Credit recovery is in progress/);
  assert.doesNotMatch(html, /Start another mock interview/);
});

test("settled retained credit does not appear to still be recovering", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "transcript-integrity-degraded",
        retryable: false,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "verified_evidence_integrity",
          recovery: null,
        },
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );

  assert.match(html, /Unable to review/);
  assert.doesNotMatch(html, /Credit recovery is in progress/);
  assert.doesNotMatch(html, /credit was returned/i);
});

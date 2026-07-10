import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FeedbackTranscriptSection,
  findTranscriptTurnReference,
  formatTranscriptTimestamp,
  getEvidenceScrollBehavior,
} from "./feedback-transcript";

const turns = [
  {
    id: "row-1",
    eventId: "writer:1",
    speaker: "user" as const,
    startedAt: "2026-07-10T12:00:00.000Z",
    text: "Recorded answer",
  },
];

test("matches evidence by canonical event reference and reports missing references", () => {
  assert.equal(findTranscriptTurnReference(turns, "writer:1")?.id, "row-1");
  assert.equal(findTranscriptTurnReference(turns, "row-1"), null);
  assert.equal(
    findTranscriptTurnReference(
      [{ ...turns[0], id: "legacy-row", eventId: null }],
      "legacy-row"
    ),
    null
  );
  assert.equal(findTranscriptTurnReference(turns, "missing"), null);
});

test("evidence scrolling honors the reduced-motion preference", () => {
  assert.equal(getEvidenceScrollBehavior(false), "smooth");
  assert.equal(getEvidenceScrollBehavior(true), "auto");
});

test("transcript failure state offers an explicit retry action", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackTranscriptSection, {
      expanded: true,
      onExpandedChange() {},
      loading: false,
      error: "Transcript could not be loaded.",
      navigationError: null,
      turns: [],
      onRetry() {},
    })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Retry transcript/);
});

test("missing cited turns produce a visible integrity message", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackTranscriptSection, {
      expanded: true,
      onExpandedChange() {},
      loading: false,
      error: null,
      navigationError:
        "The cited answer is not available in this transcript view.",
      turns,
      onRetry() {},
    })
  );
  assert.match(html, /cited answer is not available/);
  assert.match(html, /role="alert"/);
});

test("malformed timestamps are omitted", () => {
  assert.equal(formatTranscriptTimestamp("not-a-date"), "");
});

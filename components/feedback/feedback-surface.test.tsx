import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedbackReviewShell, FeedbackSectionCard } from "./feedback-surface";

test("feedback shell uses semantic light and dark theme tokens", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      FeedbackReviewShell,
      { title: "Feedback" },
      React.createElement(FeedbackSectionCard, { title: "Section" }, "Content")
    )
  );
  assert.match(html, /bg-background/);
  assert.match(html, /bg-card/);
  assert.match(html, /text-foreground/);
  assert.doesNotMatch(html, /dashboard-canvas/);
  assert.doesNotMatch(html, /--card:/);
});

test("feedback shell and sections retain responsive mobile padding", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      FeedbackReviewShell,
      null,
      React.createElement(FeedbackSectionCard, { title: "Section" }, "Content")
    )
  );
  assert.match(html, /px-4/);
  assert.match(html, /sm:px-8/);
  assert.match(html, /sm:px-6/);
});

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExploreQuestionListItem } from "./explore-question-list-item";

test("question row keeps long content inside one visible practice control", () => {
  const questionText =
    "How would you prioritize an unusually long product decision for international customers without relying on desktop hover behavior?";
  const html = renderToStaticMarkup(
    <ExploreQuestionListItem
      question={{
        id: "question-1",
        company:
          "AnExtremelyLongCompanyNameWithoutNaturalBreakpointsThatMustStillWrap",
        questionText,
        questionType: "Product Sense",
        askedAt: null,
      }}
      index={0}
      isLast
      busy
      disabled
      onPractice={() => undefined}
    />
  );

  assert.equal(html.split("<" + "button").length - 1, 1);
  assert.match(html, /role="listitem"/);
  assert.match(html, /aria-label="Practice question:/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Practice question/);
  assert.match(html, /whitespace-normal/);
  assert.match(html, /min-w-0/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, new RegExp(questionText.replace(/[?]/g, "\\?")));
  assert.doesNotMatch(html, /opacity-0/);
  assert.doesNotMatch(html, /<a\b/);
});

test("question row can expose a truthful paused state without claiming loading", () => {
  const html = renderToStaticMarkup(
    <ExploreQuestionListItem
      question={{
        id: "question-1",
        company: "Example",
        questionText: "How would you prioritize this roadmap?",
        questionType: "Product Sense",
        askedAt: null,
      }}
      index={0}
      isLast
      disabled
      practiceLabel="Practice currently paused"
      onPractice={() => undefined}
    />
  );

  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /disabled=""/);
  assert.match(html, /Practice currently paused/);
  assert.doesNotMatch(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /group-hover:translate-x-1/);
});

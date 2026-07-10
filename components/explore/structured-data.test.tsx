import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExploreStructuredData } from "./structured-data";

test("Explore schema emits API-derived visible facts without invented claims", () => {
  const html = renderToStaticMarkup(
    <ExploreStructuredData
      currentPage={1}
      totalPages={3}
      totalQuestions={41}
      questions={[
        {
          id: "question-1",
          company: "Example Company",
          questionText: "How would you measure success for a new PM product?",
          questionType: "Execution",
          askedAt: null,
          isActive: true,
          createdAt: null,
        },
      ]}
    />
  );

  assert.match(html, /How would you measure success for a new PM product\?/);
  assert.match(html, /41 currently available PM practice questions/);
  assert.doesNotMatch(html, /Example Company/);
  assert.doesNotMatch(
    html,
    /acceptedAnswer|FAQPage|author|dateModified|datePublished|aggregateRating|DataDownload|temporalCoverage|spatialCoverage|real .*asked at/i
  );
});

test("a verified empty collection never claims page one of zero", () => {
  const html = renderToStaticMarkup(
    <ExploreStructuredData
      currentPage={1}
      totalPages={0}
      totalQuestions={0}
      questions={[]}
    />
  );

  assert.match(html, /0 currently available PM practice questions/);
  assert.match(html, /Page 1 of 1/);
  assert.doesNotMatch(html, /Page 1 of 0/);
});

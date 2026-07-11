import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExploreStructuredData } from "./structured-data";
import { serializeJsonLd } from "@/lib/seo/json-ld";

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
  assert.doesNotMatch(html, /\/explore\?page=/);
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

test("Explore JSON-LD preserves adversarial stored text without creating a script", () => {
  const storedQuestion =
    '</script><script data-stored-xss="true">alert(1)</script>&>\u2028\u2029';
  const html = renderToStaticMarkup(
    <ExploreStructuredData
      currentPage={1}
      totalPages={1}
      totalQuestions={1}
      questions={[
        {
          id: "question-adversarial",
          company: null,
          questionText: storedQuestion,
          questionType: "Execution",
          askedAt: null,
          isActive: true,
          createdAt: null,
        },
      ]}
    />
  );

  assert.doesNotMatch(html, /<script data-stored-xss=/);
  const scriptMatches = [...html.matchAll(/<script[^>]*>(.*?)<\/script>/g)];
  assert.equal(scriptMatches.length, 5);
  const payloads = scriptMatches.map((match) => JSON.parse(match[1]));
  const itemList = payloads.find((payload) => payload["@type"] === "ItemList");
  assert.equal(itemList.itemListElement[0].item.text, storedQuestion);
});

test("the shared JSON-LD serializer escapes every script-sensitive character", () => {
  assert.equal(
    serializeJsonLd({ text: "<>&\u2028\u2029" }),
    '{"text":"\\u003c\\u003e\\u0026\\u2028\\u2029"}'
  );
});

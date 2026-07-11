import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SelectedQuestionConfirmation } from "./selected-question-confirmation";

test("selected question confirmation renders question, company, and round accessibly", () => {
  const html = renderToStaticMarkup(
    <SelectedQuestionConfirmation
      state={{
        status: "ready",
        question: {
          text: "How would you improve activation for a new collaboration product?",
          company: "Stripe",
          type: "Product Sense",
        },
        roundType: "product_sense",
      }}
      changeQuestionHref="/explore?type=Product+Sense"
      continueWithoutQuestionHref="/dashboard/new-interview?company=Stripe"
      onRetry={() => {}}
    />
  );

  assert.match(html, /aria-labelledby="selected-question-title"/);
  assert.match(html, /Confirm your question/);
  assert.match(html, /Stripe/);
  assert.match(html, /Product Sense/);
  assert.match(html, /How would you improve activation/);
  assert.match(html, /href="\/explore\?type=Product\+Sense"/);
  assert.match(html, /href="\/dashboard\/new-interview\?company=Stripe"/);
  assert.match(html, /flex-col/);
  assert.match(html, /sm:flex-row/);
  assert.match(html, /overflow-wrap:anywhere/);
});

test("stale question intent offers two clear recovery paths", () => {
  const html = renderToStaticMarkup(
    <SelectedQuestionConfirmation
      state={{ status: "unavailable" }}
      changeQuestionHref="/explore?company=Meta"
      continueWithoutQuestionHref="/dashboard/new-interview?company=Meta"
      onRetry={() => {}}
    />
  );

  assert.match(html, /This question is no longer available/);
  assert.match(html, /Choose another question/);
  assert.match(html, /Continue without this question/);
  assert.match(html, /href="\/explore\?company=Meta"/);
  assert.match(html, /href="\/dashboard\/new-interview\?company=Meta"/);
  assert.doesNotMatch(html, /Start mock interview/);
});

test("question validation has a polite loading state", () => {
  const html = renderToStaticMarkup(
    <SelectedQuestionConfirmation
      state={{ status: "loading" }}
      changeQuestionHref="/explore"
      continueWithoutQuestionHref="/dashboard/new-interview"
      onRetry={() => {}}
    />
  );

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Checking your selected question/);
});

test("temporary verification failure keeps intent and offers retry", () => {
  const html = renderToStaticMarkup(
    <SelectedQuestionConfirmation
      state={{ status: "temporary_error" }}
      changeQuestionHref="/explore"
      continueWithoutQuestionHref="/dashboard/new-interview"
      onRetry={() => {}}
    />
  );

  assert.match(html, /couldn’t verify this question yet/i);
  assert.match(html, /still attached to this interview/i);
  assert.match(html, /starting is paused/i);
  assert.match(html, />Retry</);
  assert.doesNotMatch(html, /This question is no longer available/);
});

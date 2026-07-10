import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewInterviewHref,
  buildQuestionInterviewHref,
  parseInterviewLaunchContext,
} from "./interview-launch";

test("launch context parses canonical and compatibility round parameters", () => {
  const canonical = parseInterviewLaunchContext(
    new URLSearchParams(
      "questionId=question-1&interview_type=strategy&roundType=behavioral&difficulty=advanced&focus=pricing&company=Stripe&returnTo=%2Fexplore%3Fcompany%3DStripe&source=voice_demo"
    )
  );

  assert.deepEqual(canonical, {
    questionId: "question-1",
    roundType: "strategy",
    difficulty: "advanced",
    focus: "pricing",
    company: "Stripe",
    returnTo: "/explore?company=Stripe",
    entrySource: "voice_demo",
  });

  assert.equal(
    parseInterviewLaunchContext(new URLSearchParams("roundType=execution"))
      .roundType,
    "execution"
  );
});

test("launch context rejects invalid enums and external return URLs", () => {
  const context = parseInterviewLaunchContext(
    new URLSearchParams(
      "interview_type=unknown&difficulty=expert&returnTo=https%3A%2F%2Fevil.example"
    )
  );

  assert.equal(context.roundType, null);
  assert.equal(context.difficulty, null);
  assert.equal(context.returnTo, null);
  assert.equal(context.entrySource, null);
});

test("canonical href preserves the complete query string", () => {
  const params = new URLSearchParams();
  params.append("questionId", "question-1");
  params.append("tag", "first");
  params.append("tag", "second");

  assert.equal(
    buildNewInterviewHref(params),
    "/dashboard/new-interview?questionId=question-1&tag=first&tag=second"
  );
  assert.equal(
    buildQuestionInterviewHref("question 1"),
    "/dashboard/new-interview?questionId=question+1"
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewHrefWithoutQuestion,
  buildNewInterviewHref,
  buildNewInterviewHrefFromPageSearchParams,
  buildQuestionInterviewHref,
  parseInterviewLaunchContext,
} from "./interview-launch";

test("launch context parses canonical and compatibility round parameters", () => {
  const canonical = parseInterviewLaunchContext(
    new URLSearchParams(
      "questionId=question-1&interview_type=strategy&roundType=behavioral&difficulty=advanced&focus=pricing&company=Stripe&returnTo=%2Fexplore%3Fcompany%3DStripe"
    )
  );

  assert.deepEqual(canonical, {
    questionId: "question-1",
    roundType: "strategy",
    difficulty: "advanced",
    focus: "pricing",
    company: "Stripe",
    returnTo: "/explore?company=Stripe",
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
    buildQuestionInterviewHref("question 1", "/explore?company=Stripe"),
    "/dashboard/new-interview?questionId=question+1&returnTo=%2Fexplore%3Fcompany%3DStripe"
  );
  assert.equal(
    buildQuestionInterviewHref("question-1", "https://evil.example"),
    "/dashboard/new-interview?questionId=question-1"
  );
});

test("server page redirects preserve repeated query values", () => {
  assert.equal(
    buildNewInterviewHrefFromPageSearchParams({
      questionId: "question 1",
      tag: ["first", "second"],
      returnTo: "/explore?company=Stripe&page=2",
      omitted: undefined,
    }),
    "/dashboard/new-interview?questionId=question+1&tag=first&tag=second&returnTo=%2Fexplore%3Fcompany%3DStripe%26page%3D2"
  );
});

test("launch context treats the first repeated or empty question ID safely", () => {
  assert.equal(
    parseInterviewLaunchContext(
      new URLSearchParams("questionId=question-1&questionId=question-2")
    ).questionId,
    "question-1"
  );
  assert.equal(
    parseInterviewLaunchContext(
      new URLSearchParams("questionId=&questionId=question-2")
    ).questionId,
    null
  );
});

test("clearing stale question intent preserves every other launch parameter", () => {
  assert.equal(
    buildInterviewHrefWithoutQuestion(
      "questionId=stale&company=Stripe&interview_type=strategy&difficulty=advanced&returnTo=%2Fexplore%3Ftype%3DStrategy&tag=first&tag=second"
    ),
    "/dashboard/new-interview?company=Stripe&interview_type=strategy&difficulty=advanced&returnTo=%2Fexplore%3Ftype%3DStrategy&tag=first&tag=second"
  );
});

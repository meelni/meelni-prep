import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXTURE_CLOCK,
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "./index";

test("product sense fixture exposes a complete interview regression scenario", () => {
  const fixture = createProductSenseInterviewFixture();

  assert.equal(fixture.session.id, "fixture-session-product-sense-1");
  assert.equal(fixture.session.roundType, "product_sense");
  assert.equal(fixture.question.company, "Meta");
  assert.equal(fixture.transcript.length, 4);
  assert.deepEqual(
    fixture.transcript.map((turn) => turn.speaker),
    ["interviewer", "user", "interviewer", "user"]
  );
  assert.equal(fixture.roomMetadata.question?.id, fixture.question.questionId);
  assert.equal(fixture.feedback.session_id, fixture.session.id);
  assert.deepEqual(fixture.feedback.scores, {
    structure: 8,
    clarity: 8,
    insight: 9,
    communication: 7,
    leadership: 7,
    overall: 8,
  });
});

test("product sense fixture returns fresh mutable copies for each test", () => {
  const first = createProductSenseInterviewFixture();
  const second = createProductSenseInterviewFixture();

  first.transcript[0].text = "Changed by a test.";
  first.feedback.strengths[0].text = "Changed strength.";

  assert.notEqual(first.transcript[0].text, second.transcript[0].text);
  assert.notEqual(
    first.feedback.strengths[0].text,
    second.feedback.strengths[0].text
  );
  assert.equal(
    second.session.startedAt.getTime(),
    FIXTURE_CLOCK.startedAt.getTime()
  );
});

test("LiveKit start fixture matches provider and transcript-event contracts", () => {
  const fixture = createLiveKitStartFixture();

  assert.equal(fixture.input.roomName, "interview-1782600000000-i00000");
  assert.equal(fixture.input.metadata.round_type, "product_sense");
  assert.equal(fixture.input.env.url, "wss://fixture.livekit.cloud");
  assert.deepEqual(fixture.transcriptEvent, {
    speaker: "interviewer",
    text: "Let's start with the product goal.",
    timestamp: 1782600000,
    is_final: true,
  });
  assert.deepEqual(fixture.expectedStartedRoom, {
    roomName: "interview-1782600000000-i00000",
    token: "fixture-livekit-token",
    url: "wss://fixture.livekit.cloud",
  });
});

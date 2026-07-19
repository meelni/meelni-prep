import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXTURE_CLOCK,
  createAccountDataExportFixture,
  createDashboardProgressFixtures,
  createFocusedPracticePlanGoldenFixtures,
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "./index";

test("account export fixture is versioned and contains no provider payloads", () => {
  const fixture = createAccountDataExportFixture();

  assert.equal(fixture.schemaVersion, "1.1.0");
  assert.equal(fixture.account.id, "fixture-account-user-1");
  assert.deepEqual(fixture.settings?.analyticsConsent, {
    decision: "undecided",
    policyVersion: null,
    source: null,
    decidedAt: null,
    revision: 0,
  });
  assert.equal(JSON.stringify(fixture).includes("stripeEventId"), false);
  assert.equal(JSON.stringify(fixture).includes("serviceRoleKey"), false);
});

test("dashboard progress fixtures cover zero, one, many, and every feedback state", () => {
  const fixtures = createDashboardProgressFixtures();

  assert.equal(fixtures.zero.length, 0);
  assert.equal(fixtures.one.length, 1);
  assert.equal(fixtures.many.length, 3);
  assert.deepEqual(
    fixtures.everyFeedbackStatus.map((session) => session.feedback?.status),
    ["pending", "processing", "failed", "skipped", "completed", "completed"]
  );
  assert.equal(
    fixtures.everyFeedbackStatus.at(-1)?.feedback?.overallScore,
    "6.2"
  );
});

test("focused-practice plan fixtures are available from the public fixture entrypoint", () => {
  const fixtures = createFocusedPracticePlanGoldenFixtures();

  assert.equal(fixtures.length, 4);
  assert.deepEqual(
    fixtures.map(
      ({ recommendationFixture }) => recommendationFixture.roundType
    ),
    ["product_sense", "execution", "behavioral", "strategy"]
  );
});

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
  assert.equal(
    fixture.roomMetadata.deadline_at,
    FIXTURE_CLOCK.endedAt.toISOString()
  );
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
    contract_version: 2,
    event_id: "transcript-event-1",
    writer_id: "writer-fixture-1",
    writer_generation: 1,
    sequence: 1,
    session_id: "fixture-session-product-sense-1",
    room_name: "interview-1782600000000-i00000",
    speaker: "interviewer",
    text: "Let's start with the product goal.",
    is_final: true,
    started_at: "2026-06-27T17:30:00.000Z",
    ended_at: "2026-06-27T17:30:08.000Z",
    audio_duration_ms: 8000,
    section: "prompt",
    delivery_state: "delivered",
  });
  assert.deepEqual(fixture.expectedStartedRoom, {
    roomName: "interview-1782600000000-i00000",
    token: "fixture-livekit-token",
    url: "wss://fixture.livekit.cloud",
  });
});

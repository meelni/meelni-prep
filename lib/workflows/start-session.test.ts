import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "@meelni/test-fixtures";

import {
  startInterviewSessionWorkflow,
  type StartInterviewSessionDeps,
} from "./start-session";

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

const user = {
  id: "fixture-user-1",
  email: "savi@example.com",
  metadata: { full_name: "Savi" },
};

test("startInterviewSessionWorkflow creates a voice interview from a selected question", async () => {
  const productFixture = createProductSenseInterviewFixture();
  const liveKitFixture = createLiveKitStartFixture();
  const calls: string[] = [];
  const deps = createDeps({
    createSession: async (input) => {
      calls.push("createSession");
      assert.equal(input.roundType, "product_sense");
      assert.equal(input.livekitRoomName, liveKitFixture.input.roomName);

      return {
        id: productFixture.session.id,
        config: input.config,
      };
    },
    getQuestionById: async (questionId) => {
      calls.push("getQuestionById");
      assert.equal(questionId, productFixture.question.questionId);
      return {
        id: productFixture.question.questionId,
        company: productFixture.question.company,
        questionText: productFixture.question.questionText,
        questionType: productFixture.question.questionType,
        askedAt: productFixture.session.startedAt,
      };
    },
    recordQuestionUsage: async (sessionId, questionId) => {
      calls.push("recordQuestionUsage");
      assert.equal(sessionId, productFixture.session.id);
      assert.equal(questionId, productFixture.question.questionId);
    },
  });

  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: {
        roundType: "product_sense",
        mode: "voice_video",
        role: "pm",
        config: productFixture.roomMetadata.config,
        questionId: productFixture.question.questionId,
      },
      env: liveKitFixture.input.env,
    },
    deps
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.body, {
      sessionId: productFixture.session.id,
      roomName: liveKitFixture.input.roomName,
      token: liveKitFixture.expectedStartedRoom.token,
      url: liveKitFixture.expectedStartedRoom.url,
      config: productFixture.roomMetadata.config,
      question: {
        id: productFixture.question.questionId,
        text: productFixture.question.questionText,
        company: productFixture.question.company,
      },
    });
  }
  assert.deepEqual(calls, [
    "getQuestionById",
    "createSession",
    "recordQuestionUsage",
  ]);
});

test("startInterviewSessionWorkflow blocks locked interview types before quota increments", async () => {
  let incrementCalled = false;
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "execution" },
      env: createLiveKitStartFixture().input.env,
    },
    createDeps({
      incrementUsage: async () => {
        incrementCalled = true;
        return { success: true };
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error, "interview_type_locked");
    assert.deepEqual(result.body.allowedTypes, ["product_sense"]);
  }
  assert.equal(incrementCalled, false);
});

test("startInterviewSessionWorkflow maps retryable LiveKit failures to service unavailable", async () => {
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "product_sense" },
      env: createLiveKitStartFixture().input.env,
    },
    createDeps({
      livekitProvider: {
        startInterviewRoom: async () => ({
          ok: false,
          provider: "livekit",
          error: {
            code: "livekit_agent_dispatch_failed",
            message: "Dispatch unavailable",
            retryable: true,
          },
        }),
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: "Failed to start voice interview" });
  }
});

function createDeps(
  overrides: Partial<StartInterviewSessionDeps> = {}
): StartInterviewSessionDeps {
  const productFixture = createProductSenseInterviewFixture();
  const liveKitFixture = createLiveKitStartFixture();
  const question = {
    id: productFixture.question.questionId,
    company: productFixture.question.company,
    questionText: productFixture.question.questionText,
    questionType: productFixture.question.questionType,
    askedAt: productFixture.session.startedAt,
  };

  const deps: Mutable<StartInterviewSessionDeps> = {
    buildRoomName: () => liveKitFixture.input.roomName,
    createSession: async (input) => ({
      id: productFixture.session.id,
      config: input.config,
    }),
    getQuestionById: async () => question,
    getRandomQuestion: async () => question,
    getRandomRecentQuestion: async () => question,
    getUserTier: async () => "free",
    incrementUsage: async () => ({ success: true }),
    livekitProvider: {
      startInterviewRoom: async () => ({
        ok: true,
        provider: "livekit",
        data: liveKitFixture.expectedStartedRoom,
      }),
    },
    recordQuestionUsage: async () => {},
    upsertUser: async () => {},
  };

  return { ...deps, ...overrides };
}

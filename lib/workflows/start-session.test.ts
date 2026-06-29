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
    reserveCredit: async (input) => {
      calls.push("reserveCredit");
      assert.equal(input.userId, user.id);
      assert.equal(
        input.reservationKey,
        `interview-start:${user.id}:${liveKitFixture.input.roomName}`
      );
      return {
        reservation: {
          id: "reservation-1",
          reservationKey: input.reservationKey,
        },
      };
    },
    consumeReservation: async (input) => {
      calls.push("consumeReservation");
      assert.equal(
        input.reservationKey,
        `interview-start:${user.id}:${liveKitFixture.input.roomName}`
      );
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
    "reserveCredit",
    "createSession",
    "recordQuestionUsage",
    "consumeReservation",
  ]);
});

test("startInterviewSessionWorkflow allows all PM round types when a credit is available", async () => {
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "execution" },
      env: createLiveKitStartFixture().input.env,
    },
    createDeps({
      createSession: async (input) => {
        assert.equal(input.roundType, "execution");
        return {
          id: createProductSenseInterviewFixture().session.id,
          config: input.config,
        };
      },
    })
  );

  assert.equal(result.ok, true);
});

test("startInterviewSessionWorkflow returns no-credit response before session work", async () => {
  const calls: string[] = [];
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "product_sense" },
      env: createLiveKitStartFixture().input.env,
    },
    createDeps({
      createSession: async (input) => {
        calls.push("createSession");
        return {
          id: createProductSenseInterviewFixture().session.id,
          config: input.config,
        };
      },
      livekitProvider: {
        startInterviewRoom: async () => {
          calls.push("startInterviewRoom");
          return {
            ok: true,
            provider: "livekit",
            data: createLiveKitStartFixture().expectedStartedRoom,
          };
        },
      },
      reserveCredit: async () => {
        calls.push("reserveCredit");
        throw new Error("insufficient_credits");
      },
      consumeReservation: async () => {
        calls.push("consumeReservation");
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 402);
    assert.equal(result.body.error, "no_credits_remaining");
    assert.equal(result.body.upgradeUrl, "/pricing");
  }
  assert.deepEqual(calls, ["reserveCredit"]);
});

test("startInterviewSessionWorkflow maps retryable LiveKit failures to service unavailable", async () => {
  const calls: string[] = [];
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "product_sense" },
      env: createLiveKitStartFixture().input.env,
    },
    createDeps({
      livekitProvider: {
        startInterviewRoom: async () => {
          calls.push("startInterviewRoom");
          return {
            ok: false,
            provider: "livekit",
            error: {
              code: "livekit_agent_dispatch_failed",
              message: "Dispatch unavailable",
              retryable: true,
            },
          };
        },
      },
      releaseReservation: async (input) => {
        calls.push(`release:${input.idempotencyKey}`);
      },
      consumeReservation: async () => {
        calls.push("consumeReservation");
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: "Failed to start voice interview" });
  }
  assert.deepEqual(calls, [
    "startInterviewRoom",
    "release:release:interview-start:fixture-user-1:interview-1782600000000-i00000",
  ]);
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
    reserveCredit: async (input) => ({
      reservation: {
        id: "reservation-1",
        reservationKey: input.reservationKey,
      },
    }),
    consumeReservation: async () => {},
    releaseReservation: async () => {},
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

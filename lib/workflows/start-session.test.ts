import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "@meelni/test-fixtures";
import type { InterviewRoomMetadata } from "@meelni/agent";
import type {
  InterviewSessionLifecycleStore,
  PersistedInterviewLifecycle,
} from "@/lib/db/session-lifecycle";

import {
  type StartInterviewSessionDeps,
  startInterviewSessionWorkflow,
} from "./start-session";
import { transitionInterviewSessionWorkflow } from "./transition-interview-session";

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
        isActive: true,
        createdAt: productFixture.session.startedAt,
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
        reservation: createReservation(input.reservationKey),
        allocations: [],
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
    transitionLifecycle: async (input) => {
      calls.push(`transition:${input.to}`);
      return createTransitionResult(input);
    },
    livekitProvider: {
      startInterviewRoom: async (input) => {
        const metadata = input.metadata as InterviewRoomMetadata;
        assert.equal(
          metadata.question?.askedAt,
          productFixture.session.startedAt.toISOString()
        );
        return {
          ok: true,
          provider: "livekit",
          data: liveKitFixture.expectedStartedRoom,
        };
      },
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
      interviewAgentName: liveKitFixture.input.agentName,
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
      config: {
        ...productFixture.roomMetadata.config,
        hintMode: "off",
        persona: null,
      },
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
    "transition:connecting",
    "consumeReservation",
  ]);
});

test("startInterviewSessionWorkflow carries hint mode through session config", async () => {
  const productFixture = createProductSenseInterviewFixture();
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: {
        roundType: "product_sense",
        config: {
          ...productFixture.roomMetadata.config,
          hintMode: "gentle",
        },
      },
      env: createLiveKitStartFixture().input.env,
      interviewAgentName: createLiveKitStartFixture().input.agentName,
    },
    createDeps({
      createSession: async (input) => {
        assert.equal(input.config?.hintMode, "gentle");
        return {
          id: productFixture.session.id,
          config: input.config,
        };
      },
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      (result.body.config as Record<string, unknown>).hintMode,
      "gentle"
    );
  }
});

test("startInterviewSessionWorkflow allows all PM round types when a credit is available", async () => {
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "execution" },
      env: createLiveKitStartFixture().input.env,
      interviewAgentName: createLiveKitStartFixture().input.agentName,
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
      interviewAgentName: createLiveKitStartFixture().input.agentName,
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
  const lifecycle = createStatefulLifecycleHarness();
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "product_sense" },
      env: createLiveKitStartFixture().input.env,
      interviewAgentName: createLiveKitStartFixture().input.agentName,
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
      transitionLifecycle: async (input) => {
        calls.push(`transition:${input.to}`);
        return lifecycle.transition(input);
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
    "transition:connecting",
    "startInterviewRoom",
    "transition:failed",
    "release:release:interview-start:fixture-user-1:interview-1782600000000-i00000",
  ]);
  assert.equal(lifecycle.current().state, "failed");
  assert.equal(lifecycle.current().terminalReason, "provider_failure");
});

test("provider failure releases credit even when lifecycle persistence fails", async () => {
  const calls: string[] = [];

  await assert.rejects(
    () =>
      startInterviewSessionWorkflow(
        {
          user,
          body: { roundType: "product_sense" },
          env: createLiveKitStartFixture().input.env,
          interviewAgentName: createLiveKitStartFixture().input.agentName,
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
          transitionLifecycle: async (input) => {
            calls.push(`transition:${input.to}`);
            if (input.to === "connecting") return createTransitionResult(input);
            return {
              ok: false,
              disposition: "conflict",
              lifecycle: createTransitionResult(input).lifecycle,
            };
          },
          releaseReservation: async () => {
            calls.push("release");
          },
        })
      ),
    /session_lifecycle_conflict/
  );

  assert.deepEqual(calls, [
    "transition:connecting",
    "transition:failed",
    "release",
  ]);
});

test("credit consume failure returns a retryable response and releases credit when lifecycle persistence also fails", async () => {
  const calls: string[] = [];
  const result = await startInterviewSessionWorkflow(
    {
      user,
      body: { roundType: "product_sense" },
      env: createLiveKitStartFixture().input.env,
      interviewAgentName: createLiveKitStartFixture().input.agentName,
    },
    createDeps({
      consumeReservation: async () => {
        calls.push("consume");
        throw new Error("credit ledger unavailable");
      },
      transitionLifecycle: async (input) => {
        calls.push(`transition:${input.to}`);
        if (input.to === "connecting") return createTransitionResult(input);
        return {
          ok: false,
          disposition: "conflict",
          lifecycle: createTransitionResult(input).lifecycle,
        };
      },
      releaseReservation: async () => {
        calls.push("release");
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.body.error, "service_unavailable");
  }
  assert.deepEqual(calls, [
    "transition:connecting",
    "consume",
    "transition:failed",
    "release",
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
    isActive: true,
    createdAt: productFixture.session.startedAt,
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
    reserveCredit: async (input) => ({
      reservation: createReservation(input.reservationKey),
      allocations: [],
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
    transitionLifecycle: async (input) => createTransitionResult(input),
    recordQuestionUsage: async () => {},
    upsertUser: async () => {},
  };

  return { ...deps, ...overrides };
}

function createTransitionResult(
  input: Parameters<StartInterviewSessionDeps["transitionLifecycle"]>[0]
) {
  const now = new Date("2026-06-29T00:00:00.000Z");
  return {
    ok: true as const,
    disposition: "applied" as const,
    lifecycle: {
      sessionId: input.sessionId,
      state: input.to,
      version: 2,
      terminalReason: input.terminalReason ?? null,
      legacyStatus:
        input.to === "failed" ? ("error" as const) : ("in_progress" as const),
      activatedAt: null,
      endingAt:
        input.to === "ending" || input.to === "failed" ? now : null,
      lastTransitionAt: now,
      endedAt: input.to === "failed" ? now : null,
    },
  };
}

function createStatefulLifecycleHarness() {
  const now = new Date("2026-06-29T00:00:00.000Z");
  let current: PersistedInterviewLifecycle = {
    sessionId: createProductSenseInterviewFixture().session.id,
    state: "created",
    version: 1,
    terminalReason: null,
    legacyStatus: "in_progress",
    activatedAt: null,
    endingAt: null,
    lastTransitionAt: now,
    endedAt: null,
  };
  const store: InterviewSessionLifecycleStore = {
    get: async () => current,
    compareAndSet: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion
      ) {
        return { applied: false, reason: "conflict", current };
      }
      current = {
        ...current,
        state: input.nextState,
        version: current.version + 1,
        terminalReason: input.terminalReason ?? null,
        legacyStatus: input.nextState === "failed" ? "error" : "in_progress",
        endingAt:
          input.nextState === "ending" || input.nextState === "failed"
            ? now
            : current.endingAt,
        endedAt: input.nextState === "failed" ? now : current.endedAt,
        lastTransitionAt: now,
      };
      return { applied: true, current };
    },
  };

  return {
    transition: (
      input: Parameters<StartInterviewSessionDeps["transitionLifecycle"]>[0]
    ) =>
      transitionInterviewSessionWorkflow(input, {
        lifecycleStore: store,
        now: () => now,
      }),
    current: () => current,
  };
}

function createReservation(reservationKey: string) {
  const now = new Date("2026-06-29T00:00:00.000Z");

  return {
    id: "reservation-1",
    userId: user.id,
    reservationKey,
    status: "active" as const,
    credits: 1,
    sessionId: null,
    expiresAt: new Date("2026-06-29T00:15:00.000Z"),
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

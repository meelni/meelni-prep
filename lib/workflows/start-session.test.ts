import assert from "node:assert/strict";
import test from "node:test";

import {
  InterviewProvisioningLeaseLostError,
  InterviewStartConflictError,
  InterviewStartFailedError,
  type InterviewStartStore,
  type PersistedStableInterviewStart,
  type StableInterviewStartInput,
} from "@/lib/db/interview-starts";
import type { ReserveCreditInput } from "@/lib/billing/credits";
import { resolveInterviewRuntimeConfig } from "@meelni/agent";

import {
  buildInterviewReservationKey,
  buildInterviewRoomNameForAttempt,
  type StartInterviewSessionDeps,
  type StartInterviewSessionInput,
  startInterviewSessionWorkflow,
} from "./start-session";

const START_ATTEMPT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const QUESTION_ID = "30000000-0000-4000-8000-000000000001";
const STARTED_AT = new Date("2026-07-10T12:00:00.000Z");

test("stable start persists one attempt, reserves once, and waits to consume", async () => {
  const fixture = createFixture();

  const result = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.sessionId, START_ATTEMPT_ID);
  assert.equal(
    result.body.roomName,
    buildInterviewRoomNameForAttempt(START_ATTEMPT_ID)
  );
  assert.equal(fixture.reservations.length, 1);
  assert.deepEqual(fixture.reservations[0], {
    userId: USER_ID,
    reservationKey: buildInterviewReservationKey(USER_ID, START_ATTEMPT_ID),
    sessionId: START_ATTEMPT_ID,
    startContractVersion: 1,
    startAttemptId: START_ATTEMPT_ID,
  });
  assert.equal(fixture.calls.filter((call) => call === "provider").length, 1);
  assert.equal(fixture.calls.filter((call) => call === "schedule").length, 1);
  assert.equal(fixture.releases.length, 0);
  assert.equal(fixture.metadata?.candidate_identity, USER_ID);
});

test("ready replay validates the same attempt and returns a fresh token without redispatch", async () => {
  const fixture = createFixture();
  const first = await startInterviewSessionWorkflow(input(), fixture.deps);
  const replay = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!first.ok || !replay.ok) return;
  assert.notEqual(first.body.token, replay.body.token);
  assert.equal(first.body.sessionId, replay.body.sessionId);
  assert.equal(fixture.calls.filter((call) => call === "provider").length, 1);
  assert.equal(fixture.calls.filter((call) => call === "schedule").length, 1);
  assert.equal(fixture.reservations.length, 2);
});

test("ready replay cannot mint a token after terminalization", async () => {
  const fixture = createFixture();
  assert.equal(
    (await startInterviewSessionWorkflow(input(), fixture.deps)).ok,
    true
  );
  fixture.store.current!.lifecycleState = "completed";
  fixture.store.current!.endedAt = new Date("2026-07-10T12:10:00.000Z");

  const replay = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.status, 409);
    assert.equal(replay.body.retryable, false);
  }
  assert.deepEqual(fixture.tokenTtls, [300]);
});

test("ready replay token is capped to whole remaining session seconds", async () => {
  const fixture = createFixture();
  assert.equal(
    (await startInterviewSessionWorkflow(input(), fixture.deps)).ok,
    true
  );
  fixture.setNow(new Date("2026-07-10T12:29:50.500Z"));

  const replay = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(replay.ok, true);
  assert.deepEqual(fixture.tokenTtls, [300, 9]);
});

test("same attempt with a changed launch intent fails closed", async () => {
  const fixture = createFixture();
  await startInterviewSessionWorkflow(input(), fixture.deps);

  const result = await startInterviewSessionWorkflow(
    input({ body: { ...input().body, roundType: "strategy" } }),
    fixture.deps
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "interview_start_attempt_conflict");
    assert.equal(result.body.retryable, false);
  }
  assert.equal(fixture.calls.filter((call) => call === "provider").length, 1);
});

test("retryable provider failure keeps the reservation and reuses the attempt", async () => {
  const fixture = createFixture({ providerFailures: 1 });

  const failed = await startInterviewSessionWorkflow(input(), fixture.deps);
  const recovered = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.status, 503);
    assert.equal(failed.body.retryable, true);
  }
  assert.equal(recovered.ok, true);
  assert.equal(fixture.releases.length, 0);
  assert.equal(fixture.calls.filter((call) => call === "provider").length, 2);
  assert.equal(fixture.store.current?.provisioningState, "ready");
});

test("lost acknowledgement after a committed ready write preserves the room", async () => {
  const fixture = createFixture({ acknowledgementCommitThenThrow: 1 });

  const result = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(fixture.store.current?.provisioningState, "ready");
  assert.equal(fixture.calls.filter((call) => call === "provider").length, 1);
  assert.equal(
    fixture.calls.filter((call) => call === "terminate-room").length,
    0
  );
  assert.deepEqual(fixture.tokenTtls, [300]);
});

test("an expired acknowledgement stays fenced for terminal recovery", async () => {
  const fixture = createFixture({ acknowledgementLeaseLost: 1 });

  const result = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.body.error, "interview_start_acknowledgement_pending");
  }
  assert.equal(fixture.store.current?.provisioningState, "provisioning");
  assert.equal(
    fixture.calls.filter((call) => call === "terminate-room").length,
    1
  );
  assert.deepEqual(fixture.tokenTtls, []);
});

test("failed-attempt replay repairs terminalization and release before becoming definitive", async () => {
  const fixture = createFixture({
    providerNonretryableFailures: 1,
    releaseFailures: 1,
  });

  const cleanupPending = await startInterviewSessionWorkflow(
    input(),
    fixture.deps
  );
  const repaired = await startInterviewSessionWorkflow(input(), fixture.deps);

  assert.equal(cleanupPending.ok, false);
  if (!cleanupPending.ok) {
    assert.equal(cleanupPending.status, 503);
    assert.equal(cleanupPending.body.error, "interview_start_cleanup_pending");
  }
  assert.equal(repaired.ok, false);
  if (!repaired.ok) {
    assert.equal(repaired.status, 409);
    assert.equal(repaired.body.retryable, false);
  }
  assert.deepEqual(fixture.releases, [
    buildInterviewReservationKey(USER_ID, START_ATTEMPT_ID),
  ]);
});

test("startAttemptId is required before any start mutation", async () => {
  const fixture = createFixture();
  const request = input();
  delete request.body.startAttemptId;

  const result = await startInterviewSessionWorkflow(request, fixture.deps);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
  assert.deepEqual(fixture.calls, []);
});

function input(
  overrides: Partial<StartInterviewSessionInput> = {}
): StartInterviewSessionInput {
  return {
    user: {
      id: USER_ID,
      email: "candidate@example.com",
      metadata: { full_name: "Candidate" },
    },
    body: {
      startAttemptId: START_ATTEMPT_ID,
      roundType: "product_sense",
      mode: "voice_video",
      config: { duration: 30 },
      questionId: QUESTION_ID,
    } as {
      startAttemptId?: unknown;
      roundType?: unknown;
      mode?: unknown;
      config?: unknown;
      questionId?: unknown;
    },
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
    interviewAgentName: "interview-agent",
    appBaseUrl: "https://meelni.test",
    ...overrides,
  };
}

function createFixture({
  providerFailures = 0,
  providerNonretryableFailures = 0,
  terminalizationFailures = 0,
  releaseFailures = 0,
  acknowledgementCommitThenThrow = 0,
  acknowledgementLeaseLost = 0,
} = {}) {
  const calls: string[] = [];
  const reservations: ReserveCreditInput[] = [];
  const releases: string[] = [];
  const tokenTtls: number[] = [];
  let tokenSequence = 0;
  let remainingProviderFailures = providerFailures;
  let remainingNonretryableProviderFailures = providerNonretryableFailures;
  let remainingTerminalizationFailures = terminalizationFailures;
  let remainingReleaseFailures = releaseFailures;
  let lifecycleState: "created" | "connecting" | "failed" = "created";
  let metadata: Record<string, unknown> | null = null;
  let currentTime = STARTED_AT;
  const store = createMemoryStartStore({
    acknowledgementCommitThenThrow,
    acknowledgementLeaseLost,
  });
  const deps: StartInterviewSessionDeps = {
    startStore: store,
    prepareStart: async ({ start, reservation }) => {
      calls.push("prepare");
      reservations.push(reservation);
      return store.createOrLoad(start);
    },
    getQuestionById: async () => ({
      id: QUESTION_ID,
      company: "Acme",
      questionText: "How would you improve Acme?",
      questionType: "Product Sense",
      askedAt: STARTED_AT,
      isActive: true,
      createdAt: STARTED_AT,
    }),
    getRandomQuestion: async () => null,
    getRandomRecentQuestion: async () => null,
    ensureTrialGrant: async () => {
      calls.push("trial");
    },
    releaseReservation: async ({ reservationKey }) => {
      if (remainingReleaseFailures-- > 0) {
        throw new Error("release unavailable");
      }
      releases.push(reservationKey);
    },
    scheduleDeadline: async () => {
      calls.push("schedule");
    },
    terminateRoom: async () => {
      calls.push("terminate-room");
    },
    markRoomCleanupComplete: async () => undefined,
    completeRoomProvisioning: async () => true,
    markRoomProvisioningSettled: async () => undefined,
    livekitProvider: {
      startInterviewRoom: async (providerInput) => {
        calls.push("provider");
        metadata = providerInput.metadata as Record<string, unknown>;
        if (remainingProviderFailures-- > 0) {
          return {
            ok: false as const,
            provider: "livekit" as const,
            error: {
              code: "livekit_unavailable",
              message: "unavailable",
              retryable: true,
            },
          };
        }
        if (remainingNonretryableProviderFailures-- > 0) {
          return {
            ok: false as const,
            provider: "livekit" as const,
            error: {
              code: "livekit_agent_dispatch_conflict",
              message: "conflict",
              retryable: false,
            },
          };
        }
        return {
          ok: true as const,
          provider: "livekit" as const,
          data: {
            roomName: providerInput.roomName,
            token: "provision-token",
            url: providerInput.env.url,
          },
        };
      },
    },
    issueParticipantToken: async (tokenInput) => {
      tokenTtls.push(tokenInput.ttlSeconds);
      return {
        ok: true,
        provider: "livekit",
        data: {
          roomName: tokenInput.roomName,
          token: `join-token-${++tokenSequence}`,
          url: tokenInput.env.url,
          expiresAt: tokenInput.expiresAt,
        },
      };
    },
    transitionLifecycle: async (transition) => {
      if (lifecycleState === "failed" && transition.to === "connecting") {
        throw new Error("failed sessions cannot reconnect");
      }
      if (
        transition.to === "failed" &&
        remainingTerminalizationFailures-- > 0
      ) {
        throw new Error("terminalization unavailable");
      }
      lifecycleState = transition.to === "failed" ? "failed" : "connecting";
      if (store.current) {
        store.current.lifecycleState = lifecycleState;
      }
      return {
        ok: true,
        disposition: "idempotent",
        lifecycle: {
          sessionId: START_ATTEMPT_ID,
          state: lifecycleState,
          version: 1,
          terminalReason: transition.terminalReason ?? null,
          legacyStatus: transition.to === "failed" ? "error" : "in_progress",
          activatedAt: null,
          endingAt: null,
          lastTransitionAt: STARTED_AT,
          endedAt: null,
        },
      };
    },
    upsertUser: async () => {
      calls.push("user");
    },
    resolveRuntimeConfig: (preferences) =>
      resolveInterviewRuntimeConfig(preferences, {
        voice: "test-voice",
        speed: 1,
        emotion: "neutral",
        volume: 1,
        feedback_mode: "end_only",
        stt_model: "test-stt",
        llm_model: "test-llm",
        tts_model: "test-tts",
      }),
    now: () => currentTime,
    createLeaseId: () => "40000000-0000-4000-8000-000000000001",
  };

  return {
    calls,
    reservations,
    releases,
    tokenTtls,
    store,
    deps,
    setNow(value: Date) {
      currentTime = value;
    },
    get metadata() {
      return metadata;
    },
  };
}

function createMemoryStartStore({
  acknowledgementCommitThenThrow = 0,
  acknowledgementLeaseLost = 0,
} = {}): InterviewStartStore & {
  current: PersistedStableInterviewStart | null;
} {
  let remainingAcknowledgementCommitThenThrow = acknowledgementCommitThenThrow;
  let remainingAcknowledgementLeaseLost = acknowledgementLeaseLost;
  const store: InterviewStartStore & {
    current: PersistedStableInterviewStart | null;
  } = {
    current: null,
    async find(input) {
      if (!store.current) return null;
      if (
        store.current.userId !== input.userId ||
        store.current.requestFingerprint !== input.requestFingerprint
      ) {
        throw new InterviewStartConflictError();
      }
      return structuredClone(store.current);
    },
    async createOrLoad(input: StableInterviewStartInput) {
      if (store.current) {
        if (
          store.current.userId !== input.userId ||
          store.current.requestFingerprint !== input.requestFingerprint
        ) {
          throw new InterviewStartConflictError();
        }
        return structuredClone(store.current);
      }
      store.current = {
        sessionId: input.startAttemptId,
        userId: input.userId,
        startAttemptId: input.startAttemptId,
        requestFingerprint: input.requestFingerprint,
        roundType: input.roundType,
        roomName: input.roomName,
        config: input.config,
        startedAt: input.startedAt,
        provisioningState: "pending",
        provisionedAt: null,
        lifecycleState: "created",
        lifecycleVersion: 0,
        endedAt: null,
        question: input.question,
      };
      return structuredClone(store.current!);
    },
    async createOrLoadAndReserve() {
      throw new Error("not used by workflow fixture");
    },
    async claimProvisioning(input) {
      if (!store.current) throw new Error("missing start");
      if (store.current.provisioningState === "failed") {
        throw new InterviewStartFailedError();
      }
      if (store.current.provisioningState === "ready") {
        return { disposition: "ready", start: structuredClone(store.current) };
      }
      store.current.provisioningState = "provisioning";
      return {
        disposition: "claimed",
        leaseId: input.leaseId,
        start: structuredClone(store.current),
      };
    },
    async markProvisioned(input) {
      if (!store.current) throw new Error("missing start");
      if (remainingAcknowledgementLeaseLost-- > 0) {
        throw new InterviewProvisioningLeaseLostError();
      }
      store.current.provisioningState = "ready";
      store.current.provisionedAt = input.provisionedAt;
      if (remainingAcknowledgementCommitThenThrow-- > 0) {
        throw new Error("provisioning acknowledgement was lost");
      }
      return structuredClone(store.current);
    },
    async releaseProvisioningClaim() {
      if (store.current) store.current.provisioningState = "pending";
    },
    async markProvisioningFailed() {
      if (store.current) store.current.provisioningState = "failed";
    },
  };
  return store;
}

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
import { resolveInterviewRuntimeConfig } from "@meelni/agent";

import {
  type StartInterviewSessionDeps,
  type StartInterviewSessionInput,
  startInterviewSessionWorkflow,
} from "./start-session";

const START_ID = "71000000-0000-4000-8000-000000000001";
const USER_ID = "72000000-0000-4000-8000-000000000001";
const QUESTION_ID = "73000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-10T12:00:00.000Z");

test("startInterviewSessionWorkflow creates a voice interview from a selected question", async () => {
  const h = harness();
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.body, {
    sessionId: START_ID,
    roomName: `interview-${START_ID}`,
    token: "join",
    url: "wss://test.livekit.cloud",
    deadlineAt: "2026-07-10T12:30:00.000Z",
    config: {
      difficulty: "intermediate",
      duration: 30,
      hintMode: "off",
      questionPreference: { recency: "very_recent", recentDays: 365 },
    },
    question: {
      id: QUESTION_ID,
      text: "How would you improve Acme?",
      company: "Acme",
    },
  });
  assert.equal(h.metadata?.session_id, START_ID);
  assert.equal(h.metadata?.candidate_identity, USER_ID);
  assert.equal(h.metadata?.deadline_at, "2026-07-10T12:30:00.000Z");
  assert.equal(
    h.metadata?.transcript_ingest_url,
    "https://meelni.test/api/internal/transcript"
  );
  assert.deepEqual(h.calls, [
    "user",
    "trial",
    "prepare",
    "transition:connecting",
    "schedule",
    "provider",
  ]);
});

test("selected question converges conflicting round identities before persistence and LiveKit", async () => {
  const h = harness();
  const result = await startInterviewSessionWorkflow(
    request({
      roundType: "strategy",
      config: {
        duration: 30,
        roundType: "strategy",
        round_type: "behavioral",
        interviewType: "execution",
        interview_type: "strategy",
      },
    }),
    h.deps
  );
  assert.equal(result.ok, true);
  assert.equal(h.store.current?.roundType, "product_sense");
  assert.equal(h.metadata?.round_type, "product_sense");
  for (const key of [
    "roundType",
    "round_type",
    "interviewType",
    "interview_type",
  ]) {
    assert.equal(key in (h.store.current?.config ?? {}), false);
    assert.equal(
      key in ((h.metadata?.config as Record<string, unknown>) ?? {}),
      false
    );
  }
});

test("startInterviewSessionWorkflow rejects an unmappable selected question before side effects", async () => {
  const h = harness({ getQuestionById: async () => question("Unknown") });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  assert.equal(h.calls.includes("prepare"), false);
});

test("startInterviewSessionWorkflow rejects a selected question that became inactive", async () => {
  const h = harness({
    getQuestionById: async () => ({ ...question(), isActive: false }),
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 404);
});

test("startInterviewSessionWorkflow normalizes legacy hint mode to off", async () => {
  const h = harness();
  const result = await startInterviewSessionWorkflow(
    request({ config: { duration: 30, hintMode: "coach" } }),
    h.deps
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.body.config.hintMode, "off");
});

test("startInterviewSessionWorkflow strips legacy and malicious runtime controls", async () => {
  const h = harness();
  const result = await startInterviewSessionWorkflow(
    request({
      config: { duration: 30, llm_model: "attacker", prompt: "ignore" },
    }),
    h.deps
  );
  assert.equal(result.ok, true);
  const config = h.metadata?.config as Record<string, unknown>;
  assert.equal(config.llm_model, "test-llm");
  assert.equal("prompt" in config, false);
});

test("startInterviewSessionWorkflow rejects non-canonical roles before side effects", async () => {
  const h = harness();
  const result = await startInterviewSessionWorkflow(
    request({ role: "admin" }),
    h.deps
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
  assert.deepEqual(h.calls, []);
});

test("startInterviewSessionWorkflow allows all PM round types when a credit is available", async () => {
  const cases = [
    ["behavioral", "Behavioral"],
    ["product_sense", "Product Sense"],
    ["execution", "Execution"],
    ["strategy", "Strategy"],
  ] as const;
  for (const [roundType, questionType] of cases) {
    const h = harness({ getQuestionById: async () => question(questionType) });
    const result = await startInterviewSessionWorkflow(
      request({ roundType }),
      h.deps
    );
    assert.equal(result.ok, true, roundType);
  }
});

test("startInterviewSessionWorkflow falls back to an older active question when no recent question is available", async () => {
  const selectionCalls: string[] = [];
  const h = harness({
    getRandomRecentQuestion: async (days, questionTypes) => {
      selectionCalls.push(`recent:${days}:${questionTypes.join(",")}`);
      return null;
    },
    getRandomQuestion: async (questionTypes) => {
      selectionCalls.push(`all:${questionTypes.join(",")}`);
      return question();
    },
  });

  const result = await startInterviewSessionWorkflow(
    request({
      questionId: undefined,
      config: {
        duration: 30,
        questionPreference: { recency: "very_recent", recentDays: 365 },
      },
    }),
    h.deps
  );

  assert.equal(result.ok, true);
  assert.deepEqual(selectionCalls, [
    "recent:365:Product Sense,Product design/strategy",
    "all:Product Sense,Product design/strategy",
  ]);
  assert.equal(h.store.current?.question.id, QUESTION_ID);
});

test("company launch context constrains recent and fallback question selection", async () => {
  const selectionCalls: Array<{
    source: "recent" | "all";
    company?: string;
  }> = [];
  const h = harness({
    getRandomRecentQuestion: async (_days, _questionTypes, company) => {
      selectionCalls.push({ source: "recent", company });
      return null;
    },
    getRandomQuestion: async (_questionTypes, company) => {
      selectionCalls.push({ source: "all", company });
      return question();
    },
  });

  const result = await startInterviewSessionWorkflow(
    request({
      questionId: undefined,
      company: "  Acme  ",
      config: {
        duration: 30,
        questionPreference: { recency: "very_recent", recentDays: 365 },
      },
    }),
    h.deps
  );

  assert.equal(result.ok, true);
  assert.deepEqual(selectionCalls, [
    { source: "recent", company: "Acme" },
    { source: "all", company: "Acme" },
  ]);
});

test("company launch context returns a truthful no-match response without broadening selection", async () => {
  const h = harness({
    getRandomRecentQuestion: async () => null,
    getRandomQuestion: async () => null,
  });

  const result = await startInterviewSessionWorkflow(
    request({
      questionId: undefined,
      company: "Acme",
      config: {
        duration: 30,
        questionPreference: { recency: "very_recent", recentDays: 365 },
      },
    }),
    h.deps
  );

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    body: {
      error: "no_company_questions_available",
      message:
        "We couldn't find an active Acme question for this interview type. Choose another company or interview type and try again.",
      retryable: false,
    },
  });
  assert.equal(h.calls.includes("prepare"), false);
});

test("startInterviewSessionWorkflow returns a recoverable message when a round has no active questions", async () => {
  const h = harness({
    getRandomRecentQuestion: async () => null,
    getRandomQuestion: async () => null,
  });

  const result = await startInterviewSessionWorkflow(
    request({
      questionId: undefined,
      config: {
        duration: 30,
        questionPreference: { recency: "very_recent", recentDays: 365 },
      },
    }),
    h.deps
  );

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    body: {
      error: "no_questions_available",
      message:
        "We couldn't find an active question for this interview type. Choose another interview type and try again.",
      retryable: false,
    },
  });
  assert.equal(h.calls.includes("prepare"), false);
  assert.equal(h.calls.includes("provider"), false);
});

test("startInterviewSessionWorkflow returns no-credit response before session work", async () => {
  const h = harness({
    prepareStart: async () => {
      throw new Error("insufficient_credits");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 402);
  assert.equal(h.calls.includes("provider"), false);
  assert.equal(h.store.current, null);
});

test("startInterviewSessionWorkflow activates the trial after user upsert and immediately before reservation", async () => {
  const h = harness();
  await startInterviewSessionWorkflow(request(), h.deps);
  assert.deepEqual(h.calls.slice(0, 3), ["user", "trial", "prepare"]);
});

test("startInterviewSessionWorkflow fails closed before reservation when trial activation fails", async () => {
  const h = harness({
    ensureTrialGrant: async () => {
      throw new Error("trial unavailable");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
  assert.equal(h.calls.includes("prepare"), false);
});

test("partial LiveKit dispatch failure durably owns cleanup when immediate teardown fails", async () => {
  const h = harness({
    livekitProvider: {
      startInterviewRoom: async () => ({
        ok: false,
        provider: "livekit",
        error: {
          code: "dispatch_partial",
          message: "partial",
          retryable: false,
        },
      }),
    },
    terminateRoom: async () => {
      h.calls.push("terminate");
      throw new Error("teardown unavailable");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(result.body.error, "interview_start_cleanup_pending");
  assert.equal(h.store.current?.provisioningState, "failed");
});

test("a thrown provider exception after connecting is treated as potentially provisioned", async () => {
  const h = harness({
    livekitProvider: {
      startInterviewRoom: async () => {
        throw new Error("dispatch unknown");
      },
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
  assert.equal(h.calls.includes("terminate"), true);
});

test("a provider exception keeps the provisioning lease when lifecycle and teardown both fail", async () => {
  const h = harness({
    livekitProvider: {
      startInterviewRoom: async () => {
        throw new Error("unknown");
      },
    },
    terminateRoom: async () => {
      h.calls.push("terminate");
      throw new Error("teardown unavailable");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  assert.equal(h.calls.includes("terminate"), true);
  assert.equal(h.store.current?.provisioningState, "pending");
});

test("a lost provisioning lease after room creation fails closed and settles the reservation", async () => {
  const h = harness();
  h.store.markProvisioned = async () => {
    throw new InterviewProvisioningLeaseLostError();
  };
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(result.body.error, "interview_start_acknowledgement_pending");
  assert.equal(h.calls.includes("terminate"), true);
  assert.equal(h.calls.includes("settle"), true);
  assert.equal(h.calls.includes("provider"), true);
});

test("deadline scheduling failure releases the provisioning claim before room creation", async () => {
  const h = harness({
    scheduleDeadline: async () => {
      h.calls.push("schedule");
      throw new Error("scheduler unavailable");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(result.body.error, "interview_lifecycle_start_pending");
  assert.equal(h.calls.includes("provider"), false);
  assert.equal(h.store.current?.provisioningState, "pending");
});

test("a lost post-provision settlement acknowledgement preserves an authorized ready room", async () => {
  const h = harness({ completeRoomProvisioning: async () => false });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, true);
  assert.equal(h.store.current?.provisioningState, "ready");
  assert.equal(h.calls.includes("terminate"), false);
});

test("missing persisted start time fails closed before room creation", async () => {
  const h = harness({
    prepareStart: async ({ start }) => ({
      ...persisted(start),
      startedAt: null as unknown as Date,
    }),
  });
  await assert.rejects(() => startInterviewSessionWorkflow(request(), h.deps));
  assert.equal(h.calls.includes("provider"), false);
});

test("retryable provider failure preserves the reservation for a safe retry", async () => {
  const h = harness({
    livekitProvider: {
      startInterviewRoom: async () => ({
        ok: false,
        provider: "livekit",
        error: { code: "unavailable", message: "down", retryable: true },
      }),
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
  assert.equal(h.calls.includes("terminate"), true);
  assert.equal(h.calls.includes("release"), false);
  assert.equal(h.store.current?.provisioningState, "pending");
});

test("a lost room-settlement acknowledgement preserves the authorized ready room", async () => {
  const h = harness({
    completeRoomProvisioning: async () => {
      throw new Error("credit ledger unavailable");
    },
  });
  const result = await startInterviewSessionWorkflow(request(), h.deps);
  assert.equal(result.ok, true);
  assert.equal(h.store.current?.provisioningState, "ready");
  assert.equal(h.calls.includes("terminate"), false);
});

function request(
  body: Record<string, unknown> = {}
): StartInterviewSessionInput {
  return {
    user: {
      id: USER_ID,
      email: "candidate@example.com",
      metadata: { full_name: "Candidate" },
    },
    body: {
      startAttemptId: START_ID,
      roundType: "product_sense",
      role: "pm",
      mode: "voice_video",
      config: { duration: 30 },
      questionId: QUESTION_ID,
      ...body,
    },
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
    interviewAgentName: "interview-agent",
    appBaseUrl: "https://meelni.test",
  };
}

function question(questionType = "Product Sense") {
  return {
    id: QUESTION_ID,
    company: "Acme",
    questionText: "How would you improve Acme?",
    questionType,
    askedAt: NOW,
    isActive: true,
    createdAt: NOW,
  };
}

function harness(overrides: Partial<StartInterviewSessionDeps> = {}) {
  const calls: string[] = [];
  let metadata: Record<string, unknown> | null = null;
  const store = memoryStore();
  const deps: StartInterviewSessionDeps = {
    startStore: store,
    prepareStart: async ({ start }) => {
      calls.push("prepare");
      return store.createOrLoad(start);
    },
    getQuestionById: async () => question(),
    getRandomQuestion: async () => question(),
    getRandomRecentQuestion: async () => question(),
    ensureTrialGrant: async () => {
      calls.push("trial");
    },
    releaseReservation: async () => {
      calls.push("release");
    },
    scheduleDeadline: async () => {
      calls.push("schedule");
    },
    terminateRoom: async () => {
      calls.push("terminate");
    },
    markRoomCleanupComplete: async () => {
      calls.push("cleanup-complete");
    },
    completeRoomProvisioning: async () => true,
    markRoomProvisioningSettled: async () => {
      calls.push("provisioning-settled");
    },
    settleCredit: async () => {
      calls.push("settle");
    },
    fenceCreatedRoomAgainstDeletion: async () => ({
      deletionPending: false,
    }),
    clearDeletionRoom: async () => {
      calls.push("clear-deletion-room");
    },
    markDeletionCleanupFailed: async () => {
      calls.push("mark-deletion-failed");
    },
    livekitProvider: {
      startInterviewRoom: async (input) => {
        calls.push("provider");
        metadata = input.metadata as Record<string, unknown>;
        return {
          ok: true,
          provider: "livekit",
          data: {
            roomName: input.roomName,
            token: "provision",
            url: input.env.url,
          },
        };
      },
    },
    issueParticipantToken: async (input) => ({
      ok: true,
      provider: "livekit",
      data: {
        roomName: input.roomName,
        token: "join",
        url: input.env.url,
        expiresAt: input.expiresAt,
      },
    }),
    transitionLifecycle: async (input) => {
      calls.push(`transition:${input.to}`);
      if (store.current) {
        store.current.lifecycleState = input.to;
        store.current.lifecycleVersion += 1;
      }
      return {
        ok: true,
        disposition: "applied",
        lifecycle: {
          sessionId: input.sessionId,
          state: input.to,
          version: store.current?.lifecycleVersion ?? 1,
          terminalReason: input.terminalReason ?? null,
          legacyStatus: input.to === "failed" ? "error" : "in_progress",
          activatedAt: null,
          endingAt: null,
          lastTransitionAt: NOW,
          endedAt: input.to === "failed" ? NOW : null,
        },
      };
    },
    upsertUser: async () => {
      calls.push("user");
    },
    resolveRuntimeConfig: (preferences) =>
      resolveInterviewRuntimeConfig(preferences, {
        voice: "test",
        speed: 1,
        emotion: "neutral",
        volume: 1,
        feedback_mode: "end_only",
        stt_model: "test-stt",
        llm_model: "test-llm",
        tts_model: "test-tts",
      }),
    now: () => NOW,
    createLeaseId: () => "74000000-0000-4000-8000-000000000001",
    ...overrides,
  };
  return {
    calls,
    store,
    deps,
    get metadata() {
      return metadata;
    },
  };
}

function memoryStore(): InterviewStartStore & {
  current: PersistedStableInterviewStart | null;
} {
  const store: InterviewStartStore & {
    current: PersistedStableInterviewStart | null;
  } = {
    current: null,
    async find(input) {
      if (!store.current) return null;
      if (
        store.current.userId !== input.userId ||
        store.current.requestFingerprint !== input.requestFingerprint
      )
        throw new InterviewStartConflictError();
      return structuredClone(store.current);
    },
    async createOrLoad(input) {
      if (!store.current) store.current = persisted(input);
      return structuredClone(store.current);
    },
    async createOrLoadAndReserve() {
      throw new Error("unused");
    },
    async claimProvisioning(input) {
      if (!store.current) throw new Error("missing");
      if (store.current.provisioningState === "failed")
        throw new InterviewStartFailedError();
      if (
        store.current.endedAt ||
        !["created", "connecting", "active", "reconnecting"].includes(
          store.current.lifecycleState
        ) ||
        NOW >= input.deadlineAt
      )
        return {
          disposition: "not_joinable",
          start: structuredClone(store.current),
        };
      if (store.current.provisioningState === "ready")
        return { disposition: "ready", start: structuredClone(store.current) };
      store.current.provisioningState = "provisioning";
      return {
        disposition: "claimed",
        leaseId: input.leaseId,
        start: structuredClone(store.current),
      };
    },
    async markProvisioned(input) {
      if (!store.current) throw new Error("missing");
      if (
        !["connecting", "active", "reconnecting"].includes(
          store.current.lifecycleState
        ) ||
        NOW >= input.deadlineAt
      )
        throw new InterviewProvisioningLeaseLostError();
      store.current.provisioningState = "ready";
      store.current.provisionedAt = input.provisionedAt;
      return structuredClone(store.current);
    },
    async authorizeProvisioned(input) {
      if (!store.current) throw new Error("missing");
      return {
        start: structuredClone(store.current),
        databaseNow: NOW,
        joinable:
          store.current.provisioningState === "ready" &&
          !store.current.endedAt &&
          ["connecting", "active", "reconnecting"].includes(
            store.current.lifecycleState
          ) &&
          NOW < input.deadlineAt,
      };
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

function persisted(
  input: StableInterviewStartInput
): PersistedStableInterviewStart {
  return {
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
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  DurablePreviewShadowControlPlaneStore,
  DurablePreviewShadowRun,
  DurablePreviewShadowSessionLease,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import {
  PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
  PREVIEW_SHADOW_SESSION_LEASE_VERSION,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import type {
  LiveKitInterviewProvider,
  StartInterviewRoomInput,
} from "@meelni/integrations";
import {
  buildPreviewShadowJobMetadata,
  createPreviewShadowRehearsalWorkflow,
  PREVIEW_SHADOW_JOB_METADATA_VERSION,
  PreviewShadowRehearsalError,
} from "./adaptive-interviewer-preview-shadow-rehearsal";

const RUN_ID = "a".repeat(64);
const AUTHORIZATION_ID = "b".repeat(64);
const CANDIDATE_SHA = "c".repeat(40);
const SESSION_BINDING = "d".repeat(64);
const WORKER_CAPABILITY = Buffer.alloc(32).toString("base64url");
const TERMINATION_CAPABILITY = Buffer.alloc(32, 2).toString("base64url");

test("rehearsal allocation completes before the room receives exact private job metadata", async () => {
  const calls: string[] = [];
  const lease = leaseFixture();
  const run = runFixture();
  let roomInput: StartInterviewRoomInput | undefined;
  const workflow = createPreviewShadowRehearsalWorkflow({
    store: storeFixture({
      allocateSessionLease: async (input) => {
        calls.push("allocate");
        assert.equal(input.workerEvidenceCapability, WORKER_CAPABILITY);
        return { outcome: "allocated", run, lease };
      },
    }),
    livekitProvider: providerFixture(async (input) => {
      calls.push("room");
      roomInput = input;
      return {
        ok: true,
        provider: "livekit",
        data: { roomName: input.roomName, token: "token", url: input.env.url },
      };
    }),
  });

  const result = await workflow.start(startInput());

  assert.deepEqual(calls, ["allocate", "room"]);
  assert.equal(result.outcome, "started");
  assert.ok(roomInput?.agentMetadata);
  const metadata = JSON.parse(roomInput.agentMetadata) as Record<
    string,
    unknown
  >;
  assert.deepEqual(Object.keys(metadata), [
    "contract_version",
    "lease",
    "worker_evidence_capability",
    "reconciliation_expected_revision",
  ]);
  assert.equal(metadata.contract_version, PREVIEW_SHADOW_JOB_METADATA_VERSION);
  assert.deepEqual(metadata.lease, lease);
  assert.equal(metadata.worker_evidence_capability, WORKER_CAPABILITY);
  assert.equal(metadata.reconciliation_expected_revision, run.revision);
  assert.deepEqual(roomInput.metadata, { public: "room-only" });
  assert.doesNotMatch(JSON.stringify(roomInput.metadata), /worker_evidence/);
  assert.doesNotMatch(roomInput.agentMetadata, /termination/);
});

test("closed lease replay makes zero room calls", async () => {
  const run = runFixture();
  let calls = 0;
  const workflow = createPreviewShadowRehearsalWorkflow({
    store: storeFixture({
      allocateSessionLease: async () => ({
        outcome: "replayed_closed",
        run,
        lease_id: "e".repeat(64),
        lease_state: "revoked",
      }),
    }),
    livekitProvider: providerFixture(async () => {
      calls += 1;
      throw new Error("must-not-run");
    }),
  });

  const result = await workflow.start(startInput());

  assert.equal(result.outcome, "closed");
  assert.equal(calls, 0);
});

test("a store result with mismatched authority makes zero room calls", async () => {
  let roomCalls = 0;
  const workflow = createPreviewShadowRehearsalWorkflow({
    store: storeFixture({
      allocateSessionLease: async () => ({
        outcome: "allocated",
        run: runFixture(),
        lease: leaseFixture({ session_binding_sha256: "8".repeat(64) }),
      }),
    }),
    livekitProvider: providerFixture(async () => {
      roomCalls += 1;
      throw new Error("must-not-run");
    }),
  });

  await assert.rejects(() => workflow.start(startInput()), closedMetadataError);
  assert.equal(roomCalls, 0);
});

test("provider failure stays content-free and preserves the admitted lease for retry", async () => {
  const lease = leaseFixture();
  const run = runFixture();
  const workflow = createPreviewShadowRehearsalWorkflow({
    store: storeFixture({
      allocateSessionLease: async () => ({
        outcome: "replayed",
        run,
        lease,
      }),
    }),
    livekitProvider: providerFixture(async () => ({
      ok: false,
      provider: "livekit",
      error: {
        code: "livekit_room_create_failed",
        message: "raw-provider-secret",
        retryable: true,
        cause: new Error("raw-provider-secret"),
      },
    })),
  });

  const result = await workflow.start(startInput());

  assert.deepEqual(result, {
    outcome: "provider_failed",
    allocation_outcome: "replayed",
    run,
    lease_id: lease.lease_id,
    provider_error_code: "livekit_room_create_failed",
    retryable: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("thrown and hostile provider results fail closed without leaking provider content", async () => {
  const lease = leaseFixture();
  const run = runFixture();
  const store = storeFixture({
    allocateSessionLease: async () => ({
      outcome: "allocated",
      run,
      lease,
    }),
  });
  const providerCalls: Array<() => Promise<unknown>> = [
    async () => {
      throw new Error("raw-provider-secret");
    },
    async () =>
      Object.defineProperty({}, "ok", {
        enumerable: true,
        get() {
          throw new Error("raw-provider-secret");
        },
      }),
    async () => ({
      ok: false,
      provider: "livekit",
      error: {
        code: "raw-provider-secret",
        message: "raw-provider-secret",
        retryable: true,
      },
    }),
  ];

  for (const providerCall of providerCalls) {
    const workflow = createPreviewShadowRehearsalWorkflow({
      store,
      livekitProvider: providerFixture(
        providerCall as LiveKitInterviewProvider["startInterviewRoom"]
      ),
    });
    const result = await workflow.start(startInput());
    assert.deepEqual(result, {
      outcome: "provider_failed",
      allocation_outcome: "allocated",
      run,
      lease_id: lease.lease_id,
      provider_error_code: "livekit_preview_shadow_start_unavailable",
      retryable: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});

test("terminal evidence delegates to the exact durable mutation without logging capability", async () => {
  const calls: unknown[] = [];
  const workflow = createPreviewShadowRehearsalWorkflow({
    store: storeFixture({
      reconcileSessionReceipt: async (input) => {
        calls.push(input);
        return { outcome: "recorded" } as never;
      },
      recordStopIncompleteIncident: async (input) => {
        calls.push(input);
        return { outcome: "recorded" } as never;
      },
    }),
    livekitProvider: providerFixture(async () => {
      throw new Error("must-not-run");
    }),
  });

  await workflow.reconcile({
    kind: "receipt",
    runId: RUN_ID,
    expectedRevision: 2,
    workerEvidenceCapability: WORKER_CAPABILITY,
    evidence: { receipt_id: "f".repeat(64) },
  });
  await workflow.reconcile({
    kind: "stop_incomplete",
    runId: RUN_ID,
    expectedRevision: 3,
    workerEvidenceCapability: WORKER_CAPABILITY,
    evidence: { incident_id: "0".repeat(64) },
  });

  assert.deepEqual(calls, [
    {
      runId: RUN_ID,
      expectedRevision: 2,
      workerEvidenceCapability: WORKER_CAPABILITY,
      receipt: { receipt_id: "f".repeat(64) },
    },
    {
      runId: RUN_ID,
      expectedRevision: 3,
      workerEvidenceCapability: WORKER_CAPABILITY,
      incident: { incident_id: "0".repeat(64) },
    },
  ]);
});

test("job metadata rejects tampered leases, malformed capabilities, and reflection traps", () => {
  const lease = leaseFixture();
  assert.throws(
    () =>
      buildPreviewShadowJobMetadata({
        lease: {
          ...lease,
          model: "other",
        } as unknown as DurablePreviewShadowSessionLease,
        workerEvidenceCapability: WORKER_CAPABILITY,
        reconciliationExpectedRevision: 1,
      }),
    closedMetadataError
  );
  assert.throws(
    () =>
      buildPreviewShadowJobMetadata({
        lease,
        workerEvidenceCapability: "A".repeat(42),
        reconciliationExpectedRevision: 1,
      }),
    closedMetadataError
  );
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("raw-worker-secret");
      },
    }
  );
  assert.throws(
    () => buildPreviewShadowJobMetadata(hostile as never),
    (error: unknown) => {
      assert.ok(error instanceof PreviewShadowRehearsalError);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }
  );
});

test("checked job metadata is byte-identical to the Python contract fixture", () => {
  const fixture = JSON.parse(
    readFileSync(
      "docs/evidence/adaptive-interviewer-preview-shadow-cross-runtime-digests.json",
      "utf8"
    )
  ) as {
    lease: DurablePreviewShadowSessionLease;
    job_metadata: {
      worker_evidence_capability: string;
      reconciliation_expected_revision: number;
    };
  };
  const encoded = buildPreviewShadowJobMetadata({
    lease: fixture.lease,
    workerEvidenceCapability: fixture.job_metadata.worker_evidence_capability,
    reconciliationExpectedRevision:
      fixture.job_metadata.reconciliation_expected_revision,
  });
  assert.equal(encoded, JSON.stringify(fixture.job_metadata));
});

function startInput() {
  return {
    allocation: {
      runId: RUN_ID,
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      expiresAt: "2026-08-20T13:00:00.000Z",
      workerEvidenceCapability: WORKER_CAPABILITY,
      terminationCapability: TERMINATION_CAPABILITY,
    },
    room: {
      agentName: "interview-agent-preview-shadow",
      identity: "participant",
      participantName: "Candidate",
      roomName: "preview-shadow-room",
      metadata: { public: "room-only" },
      env: {
        apiKey: "local-key",
        apiSecret: "local-secret",
        url: "wss://example.invalid",
      },
    },
  };
}

function leaseFixture(
  overrides: Partial<DurablePreviewShadowSessionLease> = {}
): DurablePreviewShadowSessionLease {
  const payload = {
    contract_version: PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    run_id: RUN_ID,
    authorization_id: AUTHORIZATION_ID,
    candidate_git_sha: CANDIDATE_SHA,
    preview_shadow_configuration_sha256:
      "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c",
    adapter_id: "meelni_director_openai_responses" as const,
    adapter_version: "interview-director-adapter.openai-responses.v1" as const,
    provider: "openai-api" as const,
    model: "gpt-5.4-mini-2026-03-17" as const,
    target_stage: "preview_shadow" as const,
    target_environment: "preview_staging" as const,
    target_cohort: "shadow" as const,
    exposure: "none" as const,
    session_ordinal: 1,
    session_binding_sha256: SESSION_BINDING,
    session_budget_nano_usd: 1_000_000_000 as const,
    maximum_attempts: 10 as const,
    attempt_reservation_nano_usd: 100_000_000 as const,
    issued_at: "2026-08-20T12:00:00.000Z",
    expires_at: "2026-08-20T13:00:00.000Z",
    allocation_ledger_revision: 1,
  };
  Object.assign(payload, overrides);
  const leaseId = createHash("sha256")
    .update(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
  return { ...payload, lease_id: leaseId, integrity_sha256: leaseId };
}

function runFixture(): DurablePreviewShadowRun {
  return {
    contract_version:
      "adaptive-interviewer-preview-shadow-durable-control-plane.v1",
    run_id: RUN_ID,
    authorization_id: AUTHORIZATION_ID,
    candidate_git_sha: CANDIDATE_SHA,
    preview_shadow_configuration_sha256:
      "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c",
    selected_candidate_configuration_sha256: "9".repeat(64),
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    maximum_sessions: 25,
    maximum_spend_nano_usd: 25_000_000_000,
    maximum_cumulative_spend_nano_usd: 10_000_000_000,
    allocated_session_count: 1,
    reconciled_spend_nano_usd: 0,
    outstanding_session_reservations_nano_usd: 1_000_000_000,
    stop_incomplete_excess_spend_nano_usd: 0,
    stopped: false,
    revision: 1,
    activated_at: "2026-08-20T12:00:00.000Z",
    authorization_expires_at: "2026-08-20T14:00:00.000Z",
  };
}

function storeFixture(
  overrides: Partial<DurablePreviewShadowControlPlaneStore>
): DurablePreviewShadowControlPlaneStore {
  const unavailable = async () => {
    throw new Error("unexpected-store-call");
  };
  return {
    activate: unavailable,
    allocateSessionLease: unavailable,
    reconcileSessionReceipt: unavailable,
    recordStopIncompleteIncident: unavailable,
    recordCohortStopEvent: unavailable,
    acknowledgeTermination: unavailable,
    ...overrides,
  } as DurablePreviewShadowControlPlaneStore;
}

function providerFixture(
  startInterviewRoom: LiveKitInterviewProvider["startInterviewRoom"]
): LiveKitInterviewProvider {
  return { startInterviewRoom };
}

function closedMetadataError(error: unknown): boolean {
  assert.ok(error instanceof PreviewShadowRehearsalError);
  assert.equal(error.code, "preview_shadow_rehearsal_job_metadata_invalid");
  return true;
}

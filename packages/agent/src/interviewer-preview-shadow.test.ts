import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  adaptiveInterviewerPreviewShadowConfigurationSha256,
  assessAdaptiveInterviewerTransition,
  controlPlaneActivateAdaptiveInterviewerPreviewShadow,
  controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease,
  controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger,
  controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession,
  controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete,
  createAdaptiveInterviewerPreviewShadowOwnerRequest,
  createAdaptiveInterviewerPreviewShadowActivationCommand,
  createAdaptiveInterviewerPreviewShadowSessionReceipt,
  createAdaptiveInterviewerPreviewShadowStopIncompleteIncident,
  parseAdaptiveInterviewerPreparationAuthorization,
  parseAdaptiveInterviewerPreviewShadowAuthorization,
  parseAdaptiveInterviewerPreviewShadowAuthorizationJson,
  parseAdaptiveInterviewerPreviewShadowRuntimeConfig,
  parseAdaptiveInterviewerPreviewShadowSessionLease,
  type AdaptiveInterviewerPreviewShadowAuthorization,
  type AdaptiveInterviewerPreviewShadowDurableActivationStore,
} from "./index";

const CANDIDATE_SHA = "a".repeat(40);
const SESSION_BINDING = "b".repeat(64);
const RUN_ID = "c".repeat(64);
const NOW = new Date("2026-08-20T08:00:00.000Z");

function authorization(): AdaptiveInterviewerPreviewShadowAuthorization {
  return {
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    requested_authority: "execute_bounded_preview_shadow_only",
    current_stage: "synthetic",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    candidate_git_sha: CANDIDATE_SHA,
    preview_shadow_configuration:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    owner_direction_reference:
      "linear:SAV-476:comment:fe76af4b-9a83-4899-b38e-db985e1f3c84",
    owner_decision: "approved",
    owner_decision_reference: "linear:SAV-476:comment:fresh-preview-shadow",
    owner_decided_at: "2026-08-20T07:00:00.000Z",
    authorization_expires_at: "2026-08-21T07:00:00.000Z",
    authorization_nonce: "d".repeat(64),
    one_time_execution: true,
    maximum_consumptions: 1,
    preview_shadow_execution_authorized: true,
    preview_influence_authorized: false,
    later_stage_authorized: false,
    production_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
  };
}

function bindings() {
  return {
    candidateGitSha: CANDIDATE_SHA,
    previewShadowConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selectedCandidateConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  };
}

const durableStoreCalls = new WeakMap<object, unknown[]>();

function durableStore(
  outcomes: ("activated" | "replayed" | "unavailable")[] = ["activated"]
): AdaptiveInterviewerPreviewShadowDurableActivationStore {
  const calls: unknown[] = [];
  const store: AdaptiveInterviewerPreviewShadowDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION,
    activateOnce(command) {
      calls.push(command);
      const outcome = outcomes.shift() ?? "replayed";
      return outcome === "activated"
        ? { outcome, run_id: RUN_ID }
        : { outcome };
    },
  };
  durableStoreCalls.set(store, calls);
  return store;
}

function callsFor(
  store: AdaptiveInterviewerPreviewShadowDurableActivationStore
): readonly unknown[] {
  return durableStoreCalls.get(store) ?? [];
}

function accessorClone<T extends object>(value: T, key: keyof T) {
  const clone = { ...value } as T;
  let reads = 0;
  Object.defineProperty(clone, key, {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1;
      return value[key];
    },
  });
  return { clone, reads: () => reads };
}

function ownExtraVariants<T extends object>(value: T): T[] {
  const symbolExtra = { ...value } as T & Record<PropertyKey, unknown>;
  (symbolExtra as Record<PropertyKey, unknown>)[Symbol("hidden")] = true;
  const nonEnumerableExtra = { ...value } as T;
  Object.defineProperty(nonEnumerableExtra, "hidden", { value: true });
  return [symbolExtra, nonEnumerableExtra];
}

test("exact Preview-shadow config and pending request stay deterministic and non-executable", () => {
  assert.equal(
    adaptiveInterviewerPreviewShadowConfigurationSha256(),
    "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c"
  );
  assert.equal(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
      .maximum_session_lease_nano_usd,
    1_000_000_000
  );
  assert.equal(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
      .maximum_attempt_reservation_nano_usd,
    100_000_000
  );
  assert.equal(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix
      .required_case_count,
    28
  );
  const request = createAdaptiveInterviewerPreviewShadowOwnerRequest({
    candidateGitSha: CANDIDATE_SHA,
  });
  assert.equal(
    request.owner_decision,
    "pending_exact_merged_sha_authorization"
  );
  assert.equal(request.preview_shadow_execution_authorized, false);
  assert.equal(request.authorization_nonce, null);
  assert.equal(request.preview_influence_authorized, false);
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorization(
        request,
        bindings(),
        NOW
      ),
    /authorization_invalid/
  );
  const checkedIn = JSON.parse(
    readFileSync(
      "docs/evidence/adaptive-interviewer-preview-shadow-authorization-request.pending.json",
      "utf8"
    )
  ) as Record<string, unknown>;
  assert.equal(checkedIn.candidate_git_sha, null);
  assert.equal(checkedIn.preview_shadow_execution_authorized, false);
  assert.equal(
    checkedIn.preview_shadow_configuration_sha256,
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256
  );
  assert.equal(
    parseAdaptiveInterviewerPreviewShadowRuntimeConfig(
      checkedIn.preview_shadow_configuration
    ),
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG
  );
});

test("checked cross-runtime config, authorization, and lease digests are byte-identical", () => {
  const pending = JSON.parse(
    readFileSync(
      "docs/evidence/adaptive-interviewer-preview-shadow-authorization-request.pending.json",
      "utf8"
    )
  ) as Record<string, unknown>;
  const fixture = JSON.parse(
    readFileSync(
      "docs/evidence/adaptive-interviewer-preview-shadow-cross-runtime-digests.json",
      "utf8"
    )
  ) as Record<string, any>;
  assert.equal(
    adaptiveInterviewerPreviewShadowConfigurationSha256(
      pending.preview_shadow_configuration
    ),
    fixture.configuration_sha256
  );
  const parsedAuthorization =
    parseAdaptiveInterviewerPreviewShadowAuthorization(
      {
        ...fixture.authorization_before_configuration,
        preview_shadow_configuration: pending.preview_shadow_configuration,
        ...fixture.authorization_after_configuration,
      },
      bindings(),
      NOW
    );
  assert.equal(
    adaptiveInterviewerPreviewShadowAuthorizationId(parsedAuthorization),
    fixture.authorization_sha256
  );
  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: parsedAuthorization,
    store: durableStore(),
    now: NOW,
  });
  const allocated =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  assert.deepEqual(allocated.lease, fixture.lease);
});

test("config and authorization fail closed for drift, extras, malformed time, and duplicate JSON", () => {
  const reordered = Object.fromEntries(
    Object.entries(ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG).reverse()
  );
  assert.equal(
    parseAdaptiveInterviewerPreviewShadowRuntimeConfig(reordered),
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG
  );
  for (const mutate of [
    (value: Record<string, unknown>) => {
      value.extra = true;
    },
    (value: Record<string, unknown>) => {
      value.target_stage = "preview_influence";
    },
    (value: Record<string, unknown>) => {
      value.preview_shadow_configuration_sha256 = "e".repeat(64);
    },
    (value: Record<string, unknown>) => {
      value.authorization_nonce = "short";
    },
    (value: Record<string, unknown>) => {
      value.preview_influence_authorized = true;
    },
  ]) {
    const value = JSON.parse(JSON.stringify(authorization())) as Record<
      string,
      unknown
    >;
    mutate(value);
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowAuthorization(
          value,
          bindings(),
          NOW
        ),
      /authorization_invalid|binding_mismatch/
    );
  }
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorization(
        authorization(),
        bindings(),
        new Date("2026-08-21T07:00:00.000Z")
      ),
    /authorization_invalid/
  );
  const duplicate = JSON.stringify(authorization()).replace(
    '"target_stage":"preview_shadow"',
    '"target_stage":"preview_shadow","target_stage":"preview_shadow"'
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorizationJson(
        duplicate,
        bindings(),
        NOW
      ),
    /json_invalid/
  );

  const nonEnumerableExtra = JSON.parse(
    JSON.stringify(authorization())
  ) as Record<string, unknown>;
  Object.defineProperty(nonEnumerableExtra, "hidden", { value: true });
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorization(
        nonEnumerableExtra,
        bindings(),
        NOW
      ),
    /authorization_invalid/
  );

  const symbolConfig = JSON.parse(
    JSON.stringify(ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG)
  ) as Record<PropertyKey, unknown>;
  symbolConfig[Symbol("hidden")] = true;
  assert.throws(
    () => parseAdaptiveInterviewerPreviewShadowRuntimeConfig(symbolConfig),
    /config_invalid/
  );

  const sparseConfig = JSON.parse(
    JSON.stringify(ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG)
  ) as {
    rehearsal_matrix: { voice_conditions: string[] };
  };
  const sparseConditions = new Array<string>(7);
  sparseConditions[0] = "baseline_final_turn";
  sparseConfig.rehearsal_matrix.voice_conditions = sparseConditions;
  assert.throws(
    () => parseAdaptiveInterviewerPreviewShadowRuntimeConfig(sparseConfig),
    /config_invalid/
  );

  for (const candidateGitSha of [
    CANDIDATE_SHA.toUpperCase(),
    ` ${CANDIDATE_SHA}`,
    `${CANDIDATE_SHA} `,
  ]) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowAuthorization(
          authorization(),
          { ...bindings(), candidateGitSha },
          NOW
        ),
      /binding_mismatch/
    );
  }
});

test("validated Preview values are deeply immutable", () => {
  const parsedAuthorization =
    parseAdaptiveInterviewerPreviewShadowAuthorization(
      JSON.parse(JSON.stringify(authorization())),
      bindings(),
      NOW
    );
  assert.equal(Object.isFrozen(parsedAuthorization), true);
  assert.equal(
    Object.isFrozen(parsedAuthorization.preview_shadow_configuration.director),
    true
  );
  assert.equal(
    Reflect.set(parsedAuthorization, "preview_influence_authorized", true),
    false
  );
  assert.equal(parsedAuthorization.preview_influence_authorized, false);
});

test("Preview authority is rejected by preparation and generic rollout-stage domains", () => {
  assert.notEqual(
    authorization().contract_version,
    ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreparationAuthorization(
        authorization(),
        {
          candidateGitSha: CANDIDATE_SHA,
          repositoryRolloutConfigurationSha256: "f".repeat(64),
        },
        NOW
      ),
    /authorization_invalid/
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "synthetic",
      to: "preview_shadow",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      ownerAuthorization: authorization() as never,
    }),
    { accepted: false, reason: "owner_authorization_mismatch" }
  );
  assert.deepEqual(
    assessAdaptiveInterviewerTransition({
      from: "preview_shadow",
      to: "preview_influence",
      candidateGitSha: CANDIDATE_SHA,
      configurationSha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      ownerAuthorization: authorization() as never,
    }),
    { accepted: false, reason: "owner_authorization_mismatch" }
  );
});

test("stage authorization activates once only through the durable control plane", () => {
  const store = durableStore(["activated", "replayed"]);
  const receipt = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store,
    now: NOW,
  });
  assert.equal(receipt.run_id, RUN_ID);
  assert.equal(receipt.durable_control_plane_authority, true);
  assert.equal(callsFor(store).length, 1);
  assert.throws(
    () =>
      controlPlaneActivateAdaptiveInterviewerPreviewShadow({
        authorization: authorization(),
        store,
        now: NOW,
      }),
    /replayed/
  );
  assert.throws(
    () =>
      controlPlaneActivateAdaptiveInterviewerPreviewShadow({
        authorization: authorization(),
        store: {
          ...durableStore(),
          contract_version: "process-local-store" as never,
        },
        now: NOW,
      }),
    /control_plane_required/
  );

  const malformed = {
    ...authorization(),
    preview_influence_authorized: true,
  } as never;
  const untouched = durableStore();
  assert.throws(
    () =>
      controlPlaneActivateAdaptiveInterviewerPreviewShadow({
        authorization: malformed,
        store: untouched,
        now: NOW,
      }),
    /authorization_invalid/
  );
  assert.equal(callsFor(untouched).length, 0);
});

test("reference stores cannot claim cross-instance replay protection", () => {
  const first = durableStore();
  const second = durableStore();
  const firstReceipt = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: first,
    now: NOW,
  });
  const secondReceipt = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: second,
    now: NOW,
  });
  assert.equal(firstReceipt.authorization_id, secondReceipt.authorization_id);
  assert.equal(callsFor(first).length, 1);
  assert.equal(callsFor(second).length, 1);
});

test("control-plane session leases are exact, integrity-bound, and runtime-parseable only", () => {
  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  });
  const ledger =
    controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const allocated =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger,
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  assert.equal(allocated.ledger.outstanding_session_reservations_nano_usd, 1e9);
  assert.equal(allocated.lease.maximum_attempts, 10);
  assert.equal(allocated.lease.attempt_reservation_nano_usd, 100e6);
  assert.deepEqual(
    parseAdaptiveInterviewerPreviewShadowSessionLease(
      Object.fromEntries(Object.entries(allocated.lease).reverse()),
      {
        runId: RUN_ID,
        candidateGitSha: CANDIDATE_SHA,
        sessionBindingSha256: SESSION_BINDING,
      },
      new Date("2026-08-20T08:30:00.000Z")
    ),
    allocated.lease
  );
  assert.equal(Object.isFrozen(allocated.lease), true);
  assert.equal(Reflect.set(allocated.lease, "maximum_attempts", 11), false);
  for (const [field, value] of [
    ["run_id", "d".repeat(64)],
    ["session_binding_sha256", "e".repeat(64)],
    ["preview_shadow_configuration_sha256", "f".repeat(64)],
    ["session_budget_nano_usd", 2e9],
    ["integrity_sha256", "0".repeat(64)],
  ] as const) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowSessionLease(
          { ...allocated.lease, [field]: value },
          {
            runId: RUN_ID,
            candidateGitSha: CANDIDATE_SHA,
            sessionBindingSha256: SESSION_BINDING,
          },
          new Date("2026-08-20T08:30:00.000Z")
        ),
      /session_lease_invalid/,
      field
    );
  }
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowSessionLease(
        allocated.lease,
        {
          runId: RUN_ID,
          candidateGitSha: CANDIDATE_SHA,
          sessionBindingSha256: SESSION_BINDING,
        },
        new Date("2026-08-20T09:00:00.000Z")
      ),
    /session_lease_invalid/
  );
  const symbolLease = { ...allocated.lease } as Record<PropertyKey, unknown>;
  symbolLease[Symbol("hidden")] = true;
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowSessionLease(
        symbolLease,
        {
          runId: RUN_ID,
          candidateGitSha: CANDIDATE_SHA,
          sessionBindingSha256: SESSION_BINDING,
        },
        new Date("2026-08-20T08:30:00.000Z")
      ),
    /session_lease_invalid/
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowSessionLease(
        { ...allocated.lease, session_ordinal: Number.MAX_SAFE_INTEGER + 1 },
        {
          runId: RUN_ID,
          candidateGitSha: CANDIDATE_SHA,
          sessionBindingSha256: SESSION_BINDING,
        },
        new Date("2026-08-20T08:30:00.000Z")
      ),
    /session_lease_invalid/
  );
});

test("authoritative cohort ledger counts open session leases and reconciles idempotently", () => {
  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  });
  let ledger =
    controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const leases = [];
  for (let index = 0; index < 10; index += 1) {
    const allocation =
      controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger,
        expectedRevision: ledger.revision,
        sessionBindingSha256: index.toString(16).padStart(64, "0"),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      });
    ledger = allocation.ledger;
    leases.push(allocation.lease);
  }
  assert.equal(ledger.outstanding_session_reservations_nano_usd, 10e9);
  assert.throws(
    () =>
      controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger,
        expectedRevision: ledger.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /cohort_cap_reached/
  );
  const receipt = createAdaptiveInterviewerPreviewShadowSessionReceipt({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: RUN_ID,
    lease_id: leases[0].lease_id,
    session_ordinal: leases[0].session_ordinal,
    allocation_ledger_revision: leases[0].allocation_ledger_revision,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled",
    attempt_count: 2,
    reconciled_spend_nano_usd: 2_000_000,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: "a".repeat(64),
    settled_at: "2026-08-20T08:45:00.000Z",
  });
  assert.equal(Object.isFrozen(receipt), true);
  const reconciled =
    controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger,
      expectedRevision: ledger.revision,
      receipt,
    });
  assert.equal(reconciled.outstanding_session_reservations_nano_usd, 9e9);
  assert.equal(reconciled.reconciled_spend_nano_usd, 2e6);
  assert.equal(reconciled.stopped, false);
  assert.deepEqual(
    controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger: reconciled,
      expectedRevision: reconciled.revision,
      receipt,
    }),
    reconciled
  );
  assert.throws(
    () =>
      controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: reconciled,
        expectedRevision: reconciled.revision,
        receipt: {
          ...receipt,
          reconciled_spend_nano_usd: receipt.reconciled_spend_nano_usd + 1,
        },
      }),
    /session_receipt_invalid/
  );
  assert.throws(
    () =>
      controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: reconciled,
        expectedRevision: reconciled.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /cohort_cap_reached/
  );
  const secondReceipt = createAdaptiveInterviewerPreviewShadowSessionReceipt({
    ...Object.fromEntries(
      Object.entries(receipt).filter(
        ([key]) => key !== "receipt_id" && key !== "integrity_sha256"
      )
    ),
    lease_id: leases[1].lease_id,
    session_ordinal: leases[1].session_ordinal,
    allocation_ledger_revision: leases[1].allocation_ledger_revision,
    settled_at: "2026-08-20T08:46:00.000Z",
  } as never);
  const twiceReconciled =
    controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger: reconciled,
      expectedRevision: reconciled.revision,
      receipt: secondReceipt,
    });
  const additional =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger: twiceReconciled,
      expectedRevision: twiceReconciled.revision,
      sessionBindingSha256: "f".repeat(64),
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  assert.equal(additional.ledger.allocated_session_count, 11);

  const symbolReceiptPayload = Object.fromEntries(
    Object.entries(receipt).filter(
      ([key]) => key !== "receipt_id" && key !== "integrity_sha256"
    )
  ) as Record<PropertyKey, unknown>;
  symbolReceiptPayload[Symbol("hidden")] = true;
  assert.throws(
    () =>
      createAdaptiveInterviewerPreviewShadowSessionReceipt(
        symbolReceiptPayload as never
      ),
    /session_receipt_invalid/
  );
});

test("stop-incomplete incidents stop allocation and retain the full session lease", () => {
  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  });
  const allocation =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const incident =
    createAdaptiveInterviewerPreviewShadowStopIncompleteIncident({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
      run_id: RUN_ID,
      lease_id: allocation.lease.lease_id,
      session_ordinal: allocation.lease.session_ordinal,
      allocation_ledger_revision:
        allocation.lease.allocation_ledger_revision,
      preview_shadow_configuration_sha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      reason: "cleanup_unconfirmed",
      attempt_count: 1,
      reconciled_spend_nano_usd: 100_000_000,
      retained_session_reservation_nano_usd: 1_000_000_000,
      attempt_receipts_sha256: "e".repeat(64),
      observed_at: "2026-08-20T08:45:00.000Z",
      requires_allocation_stop: true,
      termination_acknowledgement_required: true,
    });
  const stopped =
    controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
      ledger: allocation.ledger,
      expectedRevision: allocation.ledger.revision,
      incident,
    });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.open_leases.length, 1);
  assert.equal(stopped.outstanding_session_reservations_nano_usd, 1e9);
  assert.deepEqual(stopped.stop_incomplete_lease_ids, [incident.lease_id]);
  assert.deepEqual(
    controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
      ledger: stopped,
      expectedRevision: stopped.revision,
      incident,
    }),
    stopped
  );
  assert.throws(
    () =>
      controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: stopped,
        expectedRevision: stopped.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /session_allocation_denied/
  );
  assert.throws(
    () =>
      controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: stopped,
        expectedRevision: stopped.revision,
        receipt: createAdaptiveInterviewerPreviewShadowSessionReceipt({
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
          run_id: RUN_ID,
          lease_id: allocation.lease.lease_id,
          session_ordinal: allocation.lease.session_ordinal,
          allocation_ledger_revision:
            allocation.lease.allocation_ledger_revision,
          preview_shadow_configuration_sha256:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
          outcome: "stopped",
          attempt_count: 1,
          reconciled_spend_nano_usd: 100_000_000,
          outstanding_attempt_reservations_nano_usd: 0,
          attempt_receipts_sha256: "e".repeat(64),
          settled_at: "2026-08-20T08:46:00.000Z",
        }),
      }),
    /session_receipt_invalid/
  );
});

test("public Preview inputs reject accessors without invoking them and snapshot mutable data", () => {
  const configProbe = accessorClone(
    JSON.parse(
      JSON.stringify(ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG)
    ) as Record<string, unknown>,
    "stage"
  );
  assert.throws(
    () => parseAdaptiveInterviewerPreviewShadowRuntimeConfig(configProbe.clone),
    /config_invalid/
  );
  assert.equal(configProbe.reads(), 0);

  const authorizationProbe = accessorClone(authorization(), "candidate_git_sha");
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorization(
        authorizationProbe.clone,
        bindings(),
        NOW
      ),
    /authorization_invalid/
  );
  assert.equal(authorizationProbe.reads(), 0);

  const mutableAuthorization = JSON.parse(
    JSON.stringify(authorization())
  ) as AdaptiveInterviewerPreviewShadowAuthorization;
  const parsedAuthorization =
    parseAdaptiveInterviewerPreviewShadowAuthorization(
      mutableAuthorization,
      bindings(),
      NOW
    );
  mutableAuthorization.candidate_git_sha = "f".repeat(40);
  assert.equal(parsedAuthorization.candidate_git_sha, CANDIDATE_SHA);

  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  });
  const activationProbe = accessorClone(activation, "run_id");
  assert.throws(
    () =>
      controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
        activationProbe.clone
      ),
    /activation_invalid/
  );
  assert.equal(activationProbe.reads(), 0);

  const resultReads = { value: 0 };
  const resultStore: AdaptiveInterviewerPreviewShadowDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION,
    activateOnce() {
      const result = { run_id: RUN_ID } as Record<string, unknown>;
      Object.defineProperty(result, "outcome", {
        enumerable: true,
        get() {
          resultReads.value += 1;
          return "activated";
        },
      });
      return result as never;
    },
  };
  assert.throws(
    () =>
      controlPlaneActivateAdaptiveInterviewerPreviewShadow({
        authorization: authorization(),
        store: resultStore,
        now: NOW,
      }),
    /control_plane_unavailable/
  );
  assert.equal(resultReads.value, 0);

  const mutableNow = new Date(NOW);
  const timeMutatingStore: AdaptiveInterviewerPreviewShadowDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION,
    activateOnce() {
      mutableNow.setUTCFullYear(2030);
      return { outcome: "activated", run_id: RUN_ID };
    },
  };
  assert.equal(
    controlPlaneActivateAdaptiveInterviewerPreviewShadow({
      authorization: authorization(),
      store: timeMutatingStore,
      now: mutableNow,
    }).activated_at,
    NOW.toISOString()
  );

  const allocation =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const leaseProbe = accessorClone(allocation.lease, "run_id");
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowSessionLease(
        leaseProbe.clone,
        {
          runId: RUN_ID,
          candidateGitSha: CANDIDATE_SHA,
          sessionBindingSha256: SESSION_BINDING,
        },
        new Date("2026-08-20T08:30:00.000Z")
      ),
    /session_lease_invalid/
  );
  assert.equal(leaseProbe.reads(), 0);

  const ledgerProbe = accessorClone(allocation.ledger, "revision");
  assert.throws(
    () =>
      controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: ledgerProbe.clone,
        expectedRevision: 1,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /ledger_invalid/
  );
  assert.equal(ledgerProbe.reads(), 0);

  const receipt = createAdaptiveInterviewerPreviewShadowSessionReceipt({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: RUN_ID,
    lease_id: allocation.lease.lease_id,
    session_ordinal: allocation.lease.session_ordinal,
    allocation_ledger_revision: allocation.lease.allocation_ledger_revision,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled",
    attempt_count: 0,
    reconciled_spend_nano_usd: 0,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: "e".repeat(64),
    settled_at: "2026-08-20T08:45:00.000Z",
  });
  assert.equal(Object.isFrozen(receipt), true);
  const receiptProbe = accessorClone(receipt, "receipt_id");
  assert.throws(
    () =>
      controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: allocation.ledger,
        expectedRevision: allocation.ledger.revision,
        receipt: receiptProbe.clone,
      }),
    /session_receipt_invalid/
  );
  assert.equal(receiptProbe.reads(), 0);

  const incident =
    createAdaptiveInterviewerPreviewShadowStopIncompleteIncident({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
      run_id: RUN_ID,
      lease_id: allocation.lease.lease_id,
      session_ordinal: allocation.lease.session_ordinal,
      allocation_ledger_revision:
        allocation.lease.allocation_ledger_revision,
      preview_shadow_configuration_sha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      reason: "cleanup_unconfirmed",
      attempt_count: 0,
      reconciled_spend_nano_usd: 0,
      retained_session_reservation_nano_usd: 1_000_000_000,
      attempt_receipts_sha256: "e".repeat(64),
      observed_at: "2026-08-20T08:45:00.000Z",
      requires_allocation_stop: true,
      termination_acknowledgement_required: true,
    });
  assert.equal(Object.isFrozen(incident), true);
  const incidentProbe = accessorClone(incident, "incident_id");
  assert.throws(
    () =>
      controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
        ledger: allocation.ledger,
        expectedRevision: allocation.ledger.revision,
        incident: incidentProbe.clone,
      }),
    /stop_incomplete_incident_invalid/
  );
  assert.equal(incidentProbe.reads(), 0);
});

test("every public Preview record and array rejects symbol, non-enumerable, and sparse drift", () => {
  for (const candidateInput of ownExtraVariants({
    candidateGitSha: CANDIDATE_SHA,
  })) {
    assert.throws(
      () => createAdaptiveInterviewerPreviewShadowOwnerRequest(candidateInput),
      /binding_mismatch/
    );
  }
  for (const candidateAuthorization of ownExtraVariants(authorization())) {
    assert.throws(
      () =>
        createAdaptiveInterviewerPreviewShadowActivationCommand(
          candidateAuthorization,
          NOW
        ),
      /authorization_invalid|activation_invalid/
    );
  }
  for (const candidateBindings of ownExtraVariants(bindings())) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowAuthorization(
          authorization(),
          candidateBindings,
          NOW
        ),
      /binding_mismatch/
    );
  }

  const activation = controlPlaneActivateAdaptiveInterviewerPreviewShadow({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  });
  for (const candidateActivation of ownExtraVariants(activation)) {
    assert.throws(
      () =>
        controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          candidateActivation
        ),
      /activation_invalid/
    );
  }
  for (const candidateStore of ownExtraVariants(durableStore())) {
    assert.throws(
      () =>
        controlPlaneActivateAdaptiveInterviewerPreviewShadow({
          authorization: authorization(),
          store: candidateStore,
          now: NOW,
        }),
      /control_plane_unavailable/
    );
  }
  for (const candidateRequest of ownExtraVariants({
    authorization: authorization(),
    store: durableStore(),
    now: NOW,
  })) {
    assert.throws(
      () =>
        controlPlaneActivateAdaptiveInterviewerPreviewShadow(candidateRequest),
      /control_plane_unavailable/
    );
  }

  const ledger =
    controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const allocation =
    controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger,
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  for (const candidateLedger of ownExtraVariants(allocation.ledger)) {
    assert.throws(
      () =>
        controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
          ledger: candidateLedger,
          expectedRevision: 1,
          sessionBindingSha256: "f".repeat(64),
          issuedAt: NOW,
          expiresAt: new Date("2026-08-20T09:00:00.000Z"),
        }),
      /ledger_invalid/
    );
  }
  for (const candidateLease of ownExtraVariants(allocation.lease)) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowSessionLease(
          candidateLease,
          {
            runId: RUN_ID,
            candidateGitSha: CANDIDATE_SHA,
            sessionBindingSha256: SESSION_BINDING,
          },
          new Date("2026-08-20T08:30:00.000Z")
        ),
      /session_lease_invalid/
    );
  }
  for (const candidateExpected of ownExtraVariants({
    runId: RUN_ID,
    candidateGitSha: CANDIDATE_SHA,
    sessionBindingSha256: SESSION_BINDING,
  })) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowSessionLease(
          allocation.lease,
          candidateExpected,
          new Date("2026-08-20T08:30:00.000Z")
        ),
      /session_lease_invalid/
    );
  }

  const openLeaseWithSymbol = {
    ...allocation.ledger.open_leases[0],
  } as Record<PropertyKey, unknown>;
  openLeaseWithSymbol[Symbol("hidden")] = true;
  const sparseOpenLeases = new Array(1);
  for (const driftedLedger of [
    { ...allocation.ledger, open_leases: [openLeaseWithSymbol] },
    { ...allocation.ledger, open_leases: sparseOpenLeases },
    {
      ...allocation.ledger,
      reconciled_receipt_ids: Object.assign([], {
        [Symbol("hidden")]: true,
      }),
    },
  ]) {
    assert.throws(
      () =>
        controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease({
          ledger: driftedLedger as never,
          expectedRevision: 1,
          sessionBindingSha256: "f".repeat(64),
          issuedAt: NOW,
          expiresAt: new Date("2026-08-20T09:00:00.000Z"),
        }),
      /ledger_invalid/
    );
  }

  const receiptPayload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: RUN_ID,
    lease_id: allocation.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled" as const,
    attempt_count: 0,
    reconciled_spend_nano_usd: 0,
    outstanding_attempt_reservations_nano_usd: 0 as const,
    attempt_receipts_sha256: "e".repeat(64),
    settled_at: "2026-08-20T08:45:00.000Z",
  };
  for (const candidatePayload of ownExtraVariants(receiptPayload)) {
    assert.throws(
      () =>
        createAdaptiveInterviewerPreviewShadowSessionReceipt(candidatePayload),
      /session_receipt_invalid/
    );
  }
  const receipt =
    createAdaptiveInterviewerPreviewShadowSessionReceipt(receiptPayload);
  for (const candidateReceipt of ownExtraVariants(receipt)) {
    assert.throws(
      () =>
        controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession({
          ledger: allocation.ledger,
          expectedRevision: 1,
          receipt: candidateReceipt,
        }),
      /session_receipt_invalid/
    );
  }

  const incidentPayload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
    run_id: RUN_ID,
    lease_id: allocation.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed" as const,
    attempt_count: 0,
    reconciled_spend_nano_usd: 0,
    retained_session_reservation_nano_usd: 1_000_000_000 as const,
    attempt_receipts_sha256: "e".repeat(64),
    observed_at: "2026-08-20T08:45:00.000Z",
    requires_allocation_stop: true as const,
    termination_acknowledgement_required: true as const,
  };
  for (const candidatePayload of ownExtraVariants(incidentPayload)) {
    assert.throws(
      () =>
        createAdaptiveInterviewerPreviewShadowStopIncompleteIncident(
          candidatePayload
        ),
      /stop_incomplete_incident_invalid/
    );
  }
  const incident =
    createAdaptiveInterviewerPreviewShadowStopIncompleteIncident(
      incidentPayload
    );
  for (const candidateIncident of ownExtraVariants(incident)) {
    assert.throws(
      () =>
        controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
          ledger: allocation.ledger,
          expectedRevision: 1,
          incident: candidateIncident,
        }),
      /stop_incomplete_incident_invalid/
    );
  }

  const dateWithExtra = new Date(NOW);
  Object.defineProperty(dateWithExtra, "hidden", { value: true });
  assert.throws(
    () =>
      controlPlaneActivateAdaptiveInterviewerPreviewShadow({
        authorization: authorization(),
        store: durableStore(),
        now: dateWithExtra,
      }),
    /control_plane_unavailable/
  );
  class DateSubclass extends Date {}
  for (const invalidNow of [
    new Date(NOW.getTime() + 1),
    new DateSubclass(NOW),
    Object.create(Date.prototype) as Date,
  ]) {
    assert.throws(
      () =>
        parseAdaptiveInterviewerPreviewShadowAuthorization(
          authorization(),
          bindings(),
          invalidNow
        ),
      /authorization_invalid/
    );
  }
});

test("worker/runtime source cannot activate runs, mint leases, or claim global caps", () => {
  const appSource = readFileSync("agent/interview/agent.py", "utf8");
  assert.match(appSource, /adapter=None,/);
  assert.doesNotMatch(appSource, /controlPlaneActivate|SessionLease/);
  for (const path of [
    "agent/shared/interview_controller.py",
    "agent/shared/interview_director.py",
    "agent/shared/openai_responses_director_adapter.py",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /activateOnce|controlPlaneAllocate/);
  }
  assert.throws(
    () =>
      controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
        createAdaptiveInterviewerPreviewShadowSessionReceipt({
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
          run_id: RUN_ID,
          lease_id: "a".repeat(64),
          session_ordinal: 1,
          allocation_ledger_revision: 1,
          preview_shadow_configuration_sha256:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
          outcome: "settled",
          attempt_count: 0,
          reconciled_spend_nano_usd: 0,
          outstanding_attempt_reservations_nano_usd: 0,
          attempt_receipts_sha256: "b".repeat(64),
          settled_at: NOW.toISOString(),
        }) as never
      ),
    /activation_invalid/
  );
});

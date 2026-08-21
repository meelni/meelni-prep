import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_PREPARATION_AUTHORIZATION_CONTRACT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  adaptiveInterviewerPreviewShadowConfigurationSha256,
  assessAdaptiveInterviewerTransition,
  createAdaptiveInterviewerPreviewShadowOwnerRequest,
  parseAdaptiveInterviewerPreparationAuthorization,
  parseAdaptiveInterviewerPreviewShadowAuthorization,
  parseAdaptiveInterviewerPreviewShadowAuthorizationJson,
  parseAdaptiveInterviewerPreviewShadowRuntimeConfig,
  type AdaptiveInterviewerPreviewShadowAuthorization,
} from "./index";
import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION,
  createAdaptiveInterviewerPreviewShadowReferenceModelActivationCommand,
  createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent,
  createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt,
  createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident,
  parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease,
  referenceModelActivateAdaptiveInterviewerPreviewShadow,
  referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease,
  referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger,
  referenceModelReconcileAdaptiveInterviewerPreviewShadowSession,
  referenceModelRecordAdaptiveInterviewerPreviewShadowCohortStop,
  referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete,
  type AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore,
  type AdaptiveInterviewerPreviewShadowReferenceModelActivationContext,
  type AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier,
} from "./interviewer-preview-shadow-control-plane";

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

function activationContext(
  overrides: Partial<AdaptiveInterviewerPreviewShadowReferenceModelActivationContext> = {}
): AdaptiveInterviewerPreviewShadowReferenceModelActivationContext {
  return {
    candidate_git_sha: CANDIDATE_SHA,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    current_time: NOW.toISOString(),
    ...overrides,
  };
}

const ownerVerifierCalls = new WeakMap<object, unknown[]>();

function trustedOwnerDecisionVerifier(): AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier {
  const calls: unknown[] = [];
  const verifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION,
    verifyOwnerDecision(input, moduleOwnedVerification) {
      calls.push(input);
      return moduleOwnedVerification;
    },
  };
  ownerVerifierCalls.set(verifier, calls);
  return verifier;
}

function verifierCalls(
  verifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier
): readonly unknown[] {
  return ownerVerifierCalls.get(verifier) ?? [];
}

function activationInput(
  store: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore = durableStore(),
  candidateAuthorization: AdaptiveInterviewerPreviewShadowAuthorization = authorization(),
  context: AdaptiveInterviewerPreviewShadowReferenceModelActivationContext = activationContext(),
  ownerDecisionVerifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier = trustedOwnerDecisionVerifier()
) {
  return {
    authorization: candidateAuthorization,
    context,
    ownerDecisionVerifier,
    store,
  };
}

const durableStoreCalls = new WeakMap<object, unknown[]>();

function durableStore(
  outcomes: ("activated" | "replayed" | "unavailable")[] = ["activated"]
): AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore {
  const calls: unknown[] = [];
  const store: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION,
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
  store: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore
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
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput(durableStore(), parsedAuthorization)
  );
  const allocated =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
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
  const authorizationJson = JSON.stringify(authorization());
  const authorizationJsonAtLimit = `${authorizationJson}${" ".repeat(
    64 * 1_024 - Buffer.byteLength(authorizationJson, "utf8")
  )}`;
  assert.equal(
    Buffer.byteLength(authorizationJsonAtLimit, "utf8"),
    64 * 1_024
  );
  assert.doesNotThrow(() =>
    parseAdaptiveInterviewerPreviewShadowAuthorizationJson(
      authorizationJsonAtLimit,
      bindings(),
      NOW
    )
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorizationJson(
        `${authorizationJsonAtLimit} `,
        bindings(),
        NOW
      ),
    /json_invalid/
  );
  assert.throws(
    () =>
      parseAdaptiveInterviewerPreviewShadowAuthorizationJson(
        `${"[".repeat(34)}0${"]".repeat(34)}`,
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

test("stage authorization activates once only through the injected durable-store protocol", () => {
  const store = durableStore(["activated", "replayed"]);
  const receipt = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput(store)
  );
  assert.equal(receipt.run_id, RUN_ID);
  assert.equal(receipt.durable_control_plane_authority, true);
  assert.equal(callsFor(store).length, 1);
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(store)
      ),
    /replayed/
  );
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput({
          ...durableStore(),
          contract_version: "process-local-store" as never,
        })
      ),
    /control_plane_required/
  );

  const malformed = {
    ...authorization(),
    preview_influence_authorized: true,
  } as never;
  const untouched = durableStore();
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(untouched, malformed)
      ),
    /authorization_invalid/
  );
  assert.equal(callsFor(untouched).length, 0);
});

test("reference activation requires independent bindings and an opaque trusted owner decision", () => {
  const verifier = trustedOwnerDecisionVerifier();
  const store = durableStore();
  const forgedCandidate = {
    ...authorization(),
    candidate_git_sha: "f".repeat(40),
  } as AdaptiveInterviewerPreviewShadowAuthorization;
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(store, forgedCandidate, activationContext(), verifier)
      ),
    /authorization_invalid/
  );
  assert.equal(verifierCalls(verifier).length, 0);
  assert.equal(callsFor(store).length, 0);

  for (const context of [
    activationContext({ candidate_git_sha: "f".repeat(40) }),
    activationContext({
      preview_shadow_configuration_sha256: "f".repeat(64),
    }),
    activationContext({
      selected_candidate_configuration_sha256: "f".repeat(64),
    }),
  ]) {
    const untouchedVerifier = trustedOwnerDecisionVerifier();
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput(
            durableStore(),
            authorization(),
            context,
            untouchedVerifier
          )
        ),
      /activation_invalid|authorization_invalid/
    );
    assert.equal(verifierCalls(untouchedVerifier).length, 0);
  }

  const expected = authorization();
  const authenticatingVerifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION,
    verifyOwnerDecision(input, moduleOwnedVerification) {
      if (
        input.authorization_id !==
          adaptiveInterviewerPreviewShadowAuthorizationId(expected) ||
        input.owner_decision_reference !== expected.owner_decision_reference ||
        input.authorization_nonce !== expected.authorization_nonce ||
        input.authorization_expires_at !== expected.authorization_expires_at
      ) {
        throw new Error("untrusted");
      }
      return moduleOwnedVerification;
    },
  };
  for (const forged of [
    {
      ...expected,
      owner_decision_reference: "linear:SAV-476:comment:forged",
    },
    { ...expected, authorization_nonce: "e".repeat(64) },
  ] as AdaptiveInterviewerPreviewShadowAuthorization[]) {
    const untouchedStore = durableStore();
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput(
            untouchedStore,
            forged,
            activationContext(),
            authenticatingVerifier
          )
        ),
      /owner_decision_unverified/
    );
    assert.equal(callsFor(untouchedStore).length, 0);
  }

  let firstVerification: unknown;
  const staleVerifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION,
    verifyOwnerDecision(_input, moduleOwnedVerification) {
      if (firstVerification === undefined) {
        firstVerification = moduleOwnedVerification;
        return moduleOwnedVerification;
      }
      return firstVerification as never;
    },
  };
  referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput(durableStore(), authorization(), activationContext(), staleVerifier)
  );
  const secondStore = durableStore();
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(
          secondStore,
          authorization(),
          activationContext(),
          staleVerifier
        )
      ),
    /owner_decision_unverified/
  );
  assert.equal(callsFor(secondStore).length, 0);

  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow({
        ...activationInput(),
        ownerDecisionVerifier: {
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION,
          verifyOwnerDecision() {
            return true;
          },
        } as never,
      }),
    /owner_decision_unverified/
  );
});

test("reference stores cannot claim cross-instance replay protection", () => {
  const first = durableStore();
  const second = durableStore();
  const firstReceipt = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput(first)
  );
  const secondReceipt = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput(second)
  );
  assert.equal(firstReceipt.authorization_id, secondReceipt.authorization_id);
  assert.equal(callsFor(first).length, 1);
  assert.equal(callsFor(second).length, 1);
});

test("control-plane session leases are exact, integrity-bound, and runtime-parseable only", () => {
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  const ledger =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const allocated =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
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
    parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
        parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
      parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
      parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
      parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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

test("reference-model cohort ledger counts open session leases and reconciles idempotently", () => {
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  let ledger =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const leases = [];
  for (let index = 0; index < 10; index += 1) {
    const allocation =
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
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
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger,
        expectedRevision: ledger.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /cohort_cap_reached/
  );
  const receipt = createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
    run_id: RUN_ID,
    lease_id: leases[0].lease_id,
    session_ordinal: leases[0].session_ordinal,
    allocation_ledger_revision: leases[0].allocation_ledger_revision,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled",
    attempt_count: 2,
    reconciled_spend_nano_usd: 200_000_000,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: "a".repeat(64),
    settled_at: "2026-08-20T08:45:00.000Z",
  });
  assert.equal(Object.isFrozen(receipt), true);
  const reconciled =
    referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger,
      expectedRevision: ledger.revision,
      receipt,
    });
  assert.equal(reconciled.outstanding_session_reservations_nano_usd, 9e9);
  assert.equal(reconciled.reconciled_spend_nano_usd, 200e6);
  assert.equal(reconciled.stopped, true);
  assert.deepEqual(
    referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger: reconciled,
      expectedRevision: reconciled.revision,
      receipt,
    }),
    reconciled
  );
  assert.throws(
    () =>
      referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
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
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: reconciled,
        expectedRevision: reconciled.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /session_allocation_denied/
  );
  const secondReceipt = createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
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
    referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger: reconciled,
      expectedRevision: reconciled.revision,
      receipt: secondReceipt,
    });
  assert.throws(
    () =>
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: twiceReconciled,
        expectedRevision: twiceReconciled.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    }),
    /session_allocation_denied/
  );

  let highSpendLedger =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
      referenceModelActivateAdaptiveInterviewerPreviewShadow(activationInput())
    );
  const highSpendLeases = [];
  for (let index = 0; index < 10; index += 1) {
    const allocation =
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: highSpendLedger,
        expectedRevision: highSpendLedger.revision,
        sessionBindingSha256: (index + 16).toString(16).padStart(64, "0"),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      });
    highSpendLedger = allocation.ledger;
    highSpendLeases.push(allocation.lease);
  }
  for (const [index, lease] of highSpendLeases.entries()) {
    const highSpendReceipt =
      createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
        contract_version:
          ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
        run_id: RUN_ID,
        lease_id: lease.lease_id,
        session_ordinal: lease.session_ordinal,
        allocation_ledger_revision: lease.allocation_ledger_revision,
        preview_shadow_configuration_sha256:
          ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
        outcome: "settled",
        attempt_count: 10,
        reconciled_spend_nano_usd: 200_000_000_000,
        outstanding_attempt_reservations_nano_usd: 0,
        attempt_receipts_sha256: (index + 32)
          .toString(16)
          .padStart(64, "0"),
        settled_at: `2026-08-20T08:5${index}:00.000Z`,
      });
    highSpendLedger =
      referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: highSpendLedger,
        expectedRevision: highSpendLedger.revision,
        receipt: highSpendReceipt,
      });
  }
  assert.equal(highSpendLedger.reconciled_spend_nano_usd, 2_000_000_000_000);
  assert.equal(highSpendLedger.outstanding_session_reservations_nano_usd, 0);
  assert.equal(highSpendLedger.reconciled_sessions.length, 10);
  assert.equal(highSpendLedger.stopped, true);

  const symbolReceiptPayload = Object.fromEntries(
    Object.entries(receipt).filter(
      ([key]) => key !== "receipt_id" && key !== "integrity_sha256"
    )
  ) as Record<PropertyKey, unknown>;
  symbolReceiptPayload[Symbol("hidden")] = true;
  assert.throws(
    () =>
      createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(
        symbolReceiptPayload as never
      ),
    /session_receipt_invalid/
  );
});

test("stop-incomplete incidents stop allocation and retain the full session lease", () => {
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  const allocation =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const incident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION,
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
    referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
      ledger: allocation.ledger,
      expectedRevision: allocation.ledger.revision,
      incident,
    });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.open_leases.length, 1);
  assert.equal(stopped.outstanding_session_reservations_nano_usd, 1e9);
  assert.deepEqual(
    stopped.stop_incomplete_incidents.map((recorded) => recorded.lease_id),
    [incident.lease_id]
  );
  assert.deepEqual(
    referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
      ledger: stopped,
      expectedRevision: stopped.revision,
      incident,
    }),
    stopped
  );
  const {
    incident_id: _incidentId,
    integrity_sha256: _incidentIntegrity,
    ...originalIncidentPayload
  } = incident;
  const divergentIncident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
      ...originalIncidentPayload,
      attempt_count: 2,
      reconciled_spend_nano_usd: 200_000_000,
      observed_at: "2026-08-20T08:45:01.000Z",
    });
  assert.throws(
    () =>
      referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
        ledger: stopped,
        expectedRevision: stopped.revision,
        incident: divergentIncident,
      }),
    /stop_incomplete_incident_invalid/
  );
  assert.throws(
    () =>
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
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
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: { ...allocation.ledger, allocated_session_count: 0 },
        expectedRevision: allocation.ledger.revision,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /ledger_invalid/
  );
  assert.throws(
    () =>
      referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: stopped,
        expectedRevision: stopped.revision,
        receipt: createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
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

  const excessAllocation =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger: referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput()
        )
      ),
      expectedRevision: 0,
      sessionBindingSha256: "9".repeat(64),
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const excessIncident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
      ...originalIncidentPayload,
      lease_id: excessAllocation.lease.lease_id,
      session_ordinal: excessAllocation.lease.session_ordinal,
      allocation_ledger_revision:
        excessAllocation.lease.allocation_ledger_revision,
      attempt_count: 10,
      reconciled_spend_nano_usd: 11_000_000_000,
      observed_at: "2026-08-20T08:47:00.000Z",
    });
  const excessStopped =
    referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
      ledger: excessAllocation.ledger,
      expectedRevision: excessAllocation.ledger.revision,
      incident: excessIncident,
    });
  assert.equal(excessStopped.outstanding_session_reservations_nano_usd, 1e9);
  assert.equal(excessStopped.stop_incomplete_excess_spend_nano_usd, 10e9);
  assert.equal(
    excessStopped.outstanding_session_reservations_nano_usd +
      excessStopped.stop_incomplete_excess_spend_nano_usd,
    11e9
  );
  assert.equal(excessStopped.stopped, true);

  let multipleIncidentLedger =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
      referenceModelActivateAdaptiveInterviewerPreviewShadow(activationInput())
    );
  const multipleIncidentLeases = [];
  for (const binding of ["7".repeat(64), "8".repeat(64)]) {
    const next =
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: multipleIncidentLedger,
        expectedRevision: multipleIncidentLedger.revision,
        sessionBindingSha256: binding,
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      });
    multipleIncidentLedger = next.ledger;
    multipleIncidentLeases.push(next.lease);
  }
  for (const [index, lease] of multipleIncidentLeases.entries()) {
    const highSpendIncident =
      createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
        ...originalIncidentPayload,
        lease_id: lease.lease_id,
        session_ordinal: lease.session_ordinal,
        allocation_ledger_revision: lease.allocation_ledger_revision,
        attempt_count: 10,
        reconciled_spend_nano_usd: 200_000_000_000,
        attempt_receipts_sha256: (index + 48)
          .toString(16)
          .padStart(64, "0"),
        observed_at: `2026-08-20T08:48:0${index}.000Z`,
      });
    multipleIncidentLedger =
      referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
        ledger: multipleIncidentLedger,
        expectedRevision: multipleIncidentLedger.revision,
        incident: highSpendIncident,
      });
  }
  assert.equal(
    multipleIncidentLedger.stop_incomplete_excess_spend_nano_usd,
    398_000_000_000
  );
  assert.equal(
    multipleIncidentLedger.outstanding_session_reservations_nano_usd,
    2_000_000_000
  );
  assert.equal(
    multipleIncidentLedger.stop_incomplete_excess_spend_nano_usd +
      multipleIncidentLedger.outstanding_session_reservations_nano_usd,
    400_000_000_000
  );
});

test("reference-model evidence digests are canonical and conservatively bounded", () => {
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  const allocation =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const receiptPayload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
    run_id: RUN_ID,
    lease_id: allocation.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled" as const,
    attempt_count: 1,
    reconciled_spend_nano_usd: 100_000_000,
    outstanding_attempt_reservations_nano_usd: 0 as const,
    attempt_receipts_sha256: "a".repeat(64),
    settled_at: "2026-08-20T08:45:00.000Z",
  };
  const receipt =
    createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(
      receiptPayload
    );
  const reorderedReceipt =
    createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(
      Object.fromEntries(Object.entries(receiptPayload).reverse()) as never
    );
  assert.equal(reorderedReceipt.receipt_id, receipt.receipt_id);
  for (const [attemptCount, spend] of [
    [1, 99_999_999],
    [10, 999_999_999],
    [Number.MAX_SAFE_INTEGER + 1, 1_000_000_000],
    [1, Number.MAX_SAFE_INTEGER + 1],
    [1, 250_000_000_001],
  ]) {
    assert.throws(
      () =>
        createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
          ...receiptPayload,
          attempt_count: attemptCount,
          reconciled_spend_nano_usd: spend,
        }),
      /session_receipt_invalid/
    );
  }
  for (const [attemptCount, spend] of [
    [0, 0],
    [1, 100_000_000],
    [10, 1_000_000_000],
    [10, 250_000_000_000],
  ]) {
    assert.doesNotThrow(() =>
      createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
        ...receiptPayload,
        attempt_count: attemptCount,
        reconciled_spend_nano_usd: spend,
      })
    );
  }

  const incidentPayload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION,
    run_id: RUN_ID,
    lease_id: allocation.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed" as const,
    attempt_count: 1,
    reconciled_spend_nano_usd: 100_000_000,
    retained_session_reservation_nano_usd: 1_000_000_000 as const,
    attempt_receipts_sha256: "b".repeat(64),
    observed_at: "2026-08-20T08:45:00.000Z",
    requires_allocation_stop: true as const,
    termination_acknowledgement_required: true as const,
  };
  const incident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
      incidentPayload
    );
  const reorderedIncident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
      Object.fromEntries(Object.entries(incidentPayload).reverse()) as never
    );
  assert.equal(reorderedIncident.incident_id, incident.incident_id);
  assert.throws(
    () =>
      createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
        { ...incidentPayload, attempt_count: 10, reconciled_spend_nano_usd: 0 }
      ),
    /stop_incomplete_incident_invalid/
  );
  assert.doesNotThrow(() =>
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
      ...incidentPayload,
      attempt_count: 10,
      reconciled_spend_nano_usd: 250_000_000_000,
    })
  );
  assert.throws(
    () =>
      createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
        ...incidentPayload,
        attempt_count: 10,
        reconciled_spend_nano_usd: 250_000_000_001,
      }),
    /stop_incomplete_incident_invalid/
  );
});

test("reference-model ledger rejects forged relations and records closed stop events", () => {
  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  const first =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          activation
        ),
      expectedRevision: 0,
      sessionBindingSha256: "1".repeat(64),
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const receipt =
    createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
      run_id: RUN_ID,
      lease_id: first.lease.lease_id,
      session_ordinal: 1,
      allocation_ledger_revision: 1,
      preview_shadow_configuration_sha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      outcome: "settled",
      attempt_count: 1,
      reconciled_spend_nano_usd: 100_000_000,
      outstanding_attempt_reservations_nano_usd: 0,
      attempt_receipts_sha256: "c".repeat(64),
      settled_at: "2026-08-20T08:45:00.000Z",
    });
  const reconciled =
    referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
      ledger: first.ledger,
      expectedRevision: first.ledger.revision,
      receipt,
    });
  const second =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger: reconciled,
      expectedRevision: reconciled.revision,
      sessionBindingSha256: "2".repeat(64),
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  const forgedLedgers = [
    { ...second.ledger, allocated_session_count: 1 },
    {
      ...second.ledger,
      open_leases: [
        { ...second.ledger.open_leases[0], session_ordinal: 1 },
      ],
    },
    {
      ...second.ledger,
      open_leases: [
        { ...second.ledger.open_leases[0], allocation_ledger_revision: 1 },
      ],
    },
    {
      ...second.ledger,
      reconciled_sessions: [
        {
          ...second.ledger.reconciled_sessions[0],
          reconciliation_ledger_revision: 3,
        },
      ],
    },
    { ...second.ledger, reconciled_spend_nano_usd: 0 },
    { ...second.ledger, stopped: true },
    { ...second.ledger, revision: 4 },
    {
      ...second.ledger,
      reconciled_sessions: [
        {
          ...second.ledger.reconciled_sessions[0],
          reconciled_spend_nano_usd: 0,
        },
      ],
    },
  ];
  for (const forged of forgedLedgers) {
    assert.throws(
      () =>
        referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
          ledger: forged as never,
          expectedRevision: second.ledger.revision,
          sessionBindingSha256: "3".repeat(64),
          issuedAt: NOW,
          expiresAt: new Date("2026-08-20T09:00:00.000Z"),
        }),
      /ledger_invalid/
    );
  }

  const empty =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput()
      )
    );
  const aggregateBoundarySessions = Array.from({ length: 25 }, (_, index) => ({
    receipt_id: (index + 1).toString(16).padStart(64, "0"),
    lease_id: (index + 101).toString(16).padStart(64, "0"),
    session_ordinal: index + 1,
    allocation_ledger_revision: index + 1,
    reconciliation_ledger_revision: index + 26,
    attempt_count: 10,
    reconciled_spend_nano_usd: 250_000_000_000,
    outcome: "settled" as const,
  }));
  const aggregateBoundaryLedger = {
    ...empty,
    allocated_session_count: 25,
    reconciled_spend_nano_usd: 6_250_000_000_000,
    reconciled_sessions: aggregateBoundarySessions,
    stopped: true,
    revision: 50,
  };
  assert.throws(
    () =>
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: aggregateBoundaryLedger,
        expectedRevision: aggregateBoundaryLedger.revision,
        sessionBindingSha256: "4".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /session_allocation_denied/
  );
  assert.throws(
    () =>
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: {
          ...aggregateBoundaryLedger,
          reconciled_spend_nano_usd: 6_250_000_000_001,
        },
        expectedRevision: aggregateBoundaryLedger.revision,
        sessionBindingSha256: "4".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /ledger_invalid/
  );
  const stopEvent =
    createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION,
      run_id: RUN_ID,
      reason: "kill_switch_failure",
      evidence_sha256: "d".repeat(64),
      observed_at: "2026-08-20T08:30:00.000Z",
    });
  const stopped = referenceModelRecordAdaptiveInterviewerPreviewShadowCohortStop({
    ledger: empty,
    expectedRevision: 0,
    event: stopEvent,
  });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.revision, 1);
  assert.deepEqual(
    referenceModelRecordAdaptiveInterviewerPreviewShadowCohortStop({
      ledger: stopped,
      expectedRevision: 1,
      event: stopEvent,
    }),
    stopped
  );
  const divergentStop =
    createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION,
      run_id: RUN_ID,
      reason: "kill_switch_failure",
      evidence_sha256: "e".repeat(64),
      observed_at: "2026-08-20T08:31:00.000Z",
    });
  assert.throws(
    () =>
      referenceModelRecordAdaptiveInterviewerPreviewShadowCohortStop({
        ledger: stopped,
        expectedRevision: 1,
        event: divergentStop,
      }),
    /cohort_stop_event_invalid/
  );

  const hugeSparse: unknown[] = [];
  hugeSparse.length = 0xffffffff;
  assert.throws(
    () =>
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: { ...empty, open_leases: hugeSparse } as never,
        expectedRevision: 0,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /ledger_invalid/
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

  const contextProbe = accessorClone(activationContext(), "candidate_git_sha");
  const contextVerifier = trustedOwnerDecisionVerifier();
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(
          durableStore(),
          authorization(),
          contextProbe.clone,
          contextVerifier
        )
      ),
    /activation_invalid/
  );
  assert.equal(contextProbe.reads(), 0);
  assert.equal(verifierCalls(contextVerifier).length, 0);

  const verifierProbe = accessorClone(
    trustedOwnerDecisionVerifier(),
    "verifyOwnerDecision"
  );
  assert.throws(
    () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(
          durableStore(),
          authorization(),
          activationContext(),
          verifierProbe.clone
        )
      ),
    /control_plane_unavailable/
  );
  assert.equal(verifierProbe.reads(), 0);

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

  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  const activationProbe = accessorClone(activation, "run_id");
  assert.throws(
    () =>
      referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
        activationProbe.clone
      ),
    /activation_invalid/
  );
  assert.equal(activationProbe.reads(), 0);

  const resultReads = { value: 0 };
  const resultStore: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION,
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
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(resultStore)
      ),
    /control_plane_unavailable/
  );
  assert.equal(resultReads.value, 0);

  const mutableContext = activationContext();
  const timeMutatingStore: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION,
    activateOnce() {
      mutableContext.current_time = "2030-08-20T08:00:00.000Z";
      return { outcome: "activated", run_id: RUN_ID };
    },
  };
  assert.equal(
    referenceModelActivateAdaptiveInterviewerPreviewShadow(
      activationInput(
        timeMutatingStore,
        authorization(),
        mutableContext
      )
    ).activated_at,
    NOW.toISOString()
  );

  const allocation =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger:
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
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
      parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
      referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
        ledger: ledgerProbe.clone,
        expectedRevision: 1,
        sessionBindingSha256: "f".repeat(64),
        issuedAt: NOW,
        expiresAt: new Date("2026-08-20T09:00:00.000Z"),
      }),
    /ledger_invalid/
  );
  assert.equal(ledgerProbe.reads(), 0);

  const receipt = createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
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
      referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
        ledger: allocation.ledger,
        expectedRevision: allocation.ledger.revision,
        receipt: receiptProbe.clone,
      }),
    /session_receipt_invalid/
  );
  assert.equal(receiptProbe.reads(), 0);

  const incident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident({
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION,
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
      referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
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
        createAdaptiveInterviewerPreviewShadowReferenceModelActivationCommand(
          candidateAuthorization,
          activationContext()
        ),
      /authorization_invalid|activation_invalid/
    );
  }
  for (const candidateContext of ownExtraVariants(activationContext())) {
    const verifier = trustedOwnerDecisionVerifier();
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput(
            durableStore(),
            authorization(),
            candidateContext,
            verifier
          )
        ),
      /activation_invalid/
    );
    assert.equal(verifierCalls(verifier).length, 0);
  }
  for (const candidateVerifier of ownExtraVariants(
    trustedOwnerDecisionVerifier()
  )) {
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput(
            durableStore(),
            authorization(),
            activationContext(),
            candidateVerifier
          )
        ),
      /control_plane_unavailable/
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

  const activation = referenceModelActivateAdaptiveInterviewerPreviewShadow(
    activationInput()
  );
  for (const candidateActivation of ownExtraVariants(activation)) {
    assert.throws(
      () =>
        referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
          candidateActivation
        ),
      /activation_invalid/
    );
  }
  for (const candidateStore of ownExtraVariants(durableStore())) {
    assert.throws(
      () =>
      referenceModelActivateAdaptiveInterviewerPreviewShadow(
        activationInput(candidateStore)
      ),
      /control_plane_unavailable/
    );
  }
  for (const candidateRequest of ownExtraVariants(activationInput())) {
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(candidateRequest),
      /control_plane_unavailable/
    );
  }

  const ledger =
    referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(activation);
  const allocation =
    referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
      ledger,
      expectedRevision: 0,
      sessionBindingSha256: SESSION_BINDING,
      issuedAt: NOW,
      expiresAt: new Date("2026-08-20T09:00:00.000Z"),
    });
  for (const candidateLedger of ownExtraVariants(allocation.ledger)) {
    assert.throws(
      () =>
        referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
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
        parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
        parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
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
      reconciled_sessions: Object.assign([], {
        [Symbol("hidden")]: true,
      }),
    },
  ]) {
    assert.throws(
      () =>
        referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease({
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
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
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
        createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(candidatePayload),
      /session_receipt_invalid/
    );
  }
  const receipt =
    createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(receiptPayload);
  for (const candidateReceipt of ownExtraVariants(receipt)) {
    assert.throws(
      () =>
        referenceModelReconcileAdaptiveInterviewerPreviewShadowSession({
          ledger: allocation.ledger,
          expectedRevision: 1,
          receipt: candidateReceipt,
        }),
      /session_receipt_invalid/
    );
  }

  const incidentPayload = {
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION,
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
        createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
          candidatePayload
        ),
      /stop_incomplete_incident_invalid/
    );
  }
  const incident =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
      incidentPayload
    );
  for (const candidateIncident of ownExtraVariants(incident)) {
    assert.throws(
      () =>
        referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete({
          ledger: allocation.ledger,
          expectedRevision: 1,
          incident: candidateIncident,
        }),
      /stop_incomplete_incident_invalid/
    );
  }

  for (const invalidActivationTime of [
    new Date(NOW),
    "2026-08-20T01:00:00-07:00",
    "2026-08-20T08:00:00Z",
  ]) {
    assert.throws(
      () =>
        referenceModelActivateAdaptiveInterviewerPreviewShadow(
          activationInput(
            durableStore(),
            authorization(),
            activationContext({ current_time: invalidActivationTime as never })
          )
        ),
      /activation_invalid/
    );
  }
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

test("runtime and public package cannot construct or export the reference model", () => {
  const publicIndex = readFileSync("packages/agent/src/index.ts", "utf8");
  const referenceSource = readFileSync(
    "packages/agent/src/interviewer-preview-shadow-control-plane.ts",
    "utf8"
  );
  assert.match(
    publicIndex,
    /Inert source-attestation import only;[\s\S]*import "\.\/interviewer-preview-shadow-control-plane";/
  );
  assert.doesNotMatch(
    publicIndex,
    /export\s+(?:\*|\{[^}]*\})\s+from\s+["']\.\/interviewer-preview-shadow-control-plane["']/
  );
  assert.doesNotMatch(referenceSource, /^export (?:async )?function controlPlane/m);
  const exportedNames = [
    ...referenceSource.matchAll(
      /^export (?:const|function|interface|type)\s+([A-Za-z0-9_]+)/gm
    ),
  ].map((match) => match[1]);
  assert.ok(exportedNames.length > 0);
  assert.ok(
    exportedNames.every((name) =>
      /ReferenceModel|referenceModel|REFERENCE_MODEL/.test(name)
    )
  );
  assert.doesNotMatch(
    referenceSource,
    /process\.env|Deno\.env|Bun\.env|OpenAIResponsesDirectorAdapter|createPreviewShadowRuntime|createRoom|register(?:Factory|Adapter)|Statsig/
  );
  const appSource = readFileSync("agent/interview/agent.py", "utf8");
  assert.match(appSource, /create_production_director_runtime/);
  assert.match(appSource, /adapter=production_director\.adapter/);
  assert.doesNotMatch(
    appSource,
    /interviewer-preview-shadow-control-plane|controlPlaneActivate/
  );
  for (const path of [
    "agent/shared/interview_controller.py",
    "agent/shared/interview_director.py",
    "agent/shared/openai_responses_director_adapter.py",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /interviewer-preview-shadow-control-plane|activateOnce|controlPlaneAllocate/
    );
  }
  assert.throws(
    () =>
      referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
        createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt({
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION,
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

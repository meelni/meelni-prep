import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  type AdaptiveInterviewerPreviewShadowAuthorization,
} from "@meelni/agent";

import {
  PREVIEW_SHADOW_OWNER_APPROVAL,
  PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
  PREVIEW_SHADOW_OWNER_DECISION_MAX_BYTES,
  PREVIEW_SHADOW_OWNER_ID,
  PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
  PREVIEW_SHADOW_OWNER_ROLE,
  assertPreviewShadowOwnerDecisionAuthenticated,
  parsePreviewShadowOwnerDecisionArtifactJson,
  previewShadowOwnerDecisionSignatureMessage,
  authenticatePreviewShadowOwnerDecision,
  type PreviewShadowActivationContext,
  type PreviewShadowOwnerDecisionArtifact,
  type PreviewShadowOwnerDecisionPayload,
  type PreviewShadowOwnerKeyRegistry,
  type AuthenticatedPreviewShadowOwnerDecision,
} from "./adaptive-interviewer-preview-shadow-owner-decision";

const CANDIDATE_SHA = "a".repeat(40);
const KEY_ID = "owner-test-key";
const NOW = new Date("2026-08-20T08:00:00.000Z");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

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
    owner_decision_reference: "linear:SAV-480:comment:exact-owner-decision",
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

function context(): PreviewShadowActivationContext {
  return {
    candidateGitSha: CANDIDATE_SHA,
    previewShadowConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selectedCandidateConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    targetStage: "preview_shadow",
    targetEnvironment: "preview_staging",
    targetCohort: "shadow",
    exposure: "none",
  };
}

function payload(
  candidateAuthorization = authorization()
): PreviewShadowOwnerDecisionPayload {
  return {
    authorization_expires_at: candidateAuthorization.authorization_expires_at,
    authorization_id: adaptiveInterviewerPreviewShadowAuthorizationId(
      candidateAuthorization
    ),
    authorization_nonce: candidateAuthorization.authorization_nonce,
    candidate_git_sha: candidateAuthorization.candidate_git_sha,
    default_on_authorized: false,
    exposure: "none",
    later_stage_authorized: false,
    launch_go_no_go_authorized: false,
    owner_decided_at: candidateAuthorization.owner_decided_at,
    owner_decision: PREVIEW_SHADOW_OWNER_APPROVAL,
    owner_decision_reference: candidateAuthorization.owner_decision_reference,
    owner_direction_reference: candidateAuthorization.owner_direction_reference,
    owner_id: PREVIEW_SHADOW_OWNER_ID,
    owner_role: PREVIEW_SHADOW_OWNER_ROLE,
    preview_influence_authorized: false,
    preview_shadow_configuration_sha256:
      candidateAuthorization.preview_shadow_configuration_sha256,
    production_authorized: false,
    selected_candidate_configuration_sha256:
      candidateAuthorization.selected_candidate_configuration_sha256,
    signing_key_id: KEY_ID,
    target_cohort: "shadow",
    target_environment: "preview_staging",
    target_stage: "preview_shadow",
  };
}

function artifact(
  candidatePayload = payload()
): PreviewShadowOwnerDecisionArtifact {
  return {
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload: candidatePayload,
    signature: {
      algorithm: "ed25519",
      keyId: KEY_ID,
      value: sign(
        null,
        previewShadowOwnerDecisionSignatureMessage(candidatePayload),
        privateKey
      ).toString("base64"),
    },
  };
}

function registry(): PreviewShadowOwnerKeyRegistry {
  return {
    contract: PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
    ownerId: PREVIEW_SHADOW_OWNER_ID,
    keys: [
      {
        algorithm: "ed25519",
        keyId: KEY_ID,
        notAfter: "2027-01-01T00:00:00.000Z",
        notBefore: "2026-01-01T00:00:00.000Z",
        publicKeyPem: publicKey.export({
          type: "spki",
          format: "pem",
        }) as string,
        status: "active",
      },
    ],
  };
}

function verify(
  overrides: Partial<
    Parameters<typeof authenticatePreviewShadowOwnerDecision>[0]
  > = {}
) {
  return authenticatePreviewShadowOwnerDecision({
    artifact: artifact(),
    authorization: authorization(),
    context: context(),
    keyRegistry: registry(),
    now: NOW,
    ...overrides,
  });
}

test("authenticates one exact domain-separated owner decision without raw material", () => {
  const verified = verify();
  assertPreviewShadowOwnerDecisionAuthenticated(verified);
  assert.equal(
    verified.authorizationId,
    adaptiveInterviewerPreviewShadowAuthorizationId(authorization())
  );
  assert.match(verified.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(verified.ownerSigningKeyId, KEY_ID);
  assert.equal(verified.targetStage, "preview_shadow");
  assert.equal(JSON.stringify(verified).includes("signature"), false);
  assert.equal(JSON.stringify(verified).includes("PRIVATE KEY"), false);
  assert.throws(
    () =>
      assertPreviewShadowOwnerDecisionAuthenticated({
        ...verified,
      } as AuthenticatedPreviewShadowOwnerDecision),
    /owner_decision_unauthenticated/
  );
});

test("rejects binding, signature, key, time, and cross-domain drift with closed errors", () => {
  const cases: Array<() => unknown> = [
    () =>
      verify({
        context: { ...context(), candidateGitSha: "b".repeat(40) },
      }),
    () =>
      verify({
        artifact: artifact({
          ...payload(),
          authorization_nonce: "e".repeat(64),
        }),
      }),
    () =>
      verify({
        artifact: {
          ...artifact(),
          contract: "meelni.production-action-authorization.v1",
        },
      }),
    () =>
      verify({
        artifact: {
          ...artifact(),
          signature: { ...artifact().signature, value: "A".repeat(88) },
        },
      }),
    () =>
      verify({
        keyRegistry: {
          ...registry(),
          keys: [{ ...registry().keys[0]!, status: "revoked" }],
        },
      }),
  ];
  for (const run of cases) {
    assert.throws(run, /^Error: preview_shadow_/);
  }
  const authenticatedExpiredDecision = verify({
    now: new Date("2026-08-21T07:00:00.000Z"),
  });
  assertPreviewShadowOwnerDecisionAuthenticated(authenticatedExpiredDecision);
  assert.equal(
    authenticatedExpiredDecision.authorizationExpiresAt,
    "2026-08-21T07:00:00.000Z"
  );
});

test("strict JSON rejects duplicates, oversized/deep input, and object descriptor tricks", () => {
  const json = JSON.stringify(artifact());
  assert.deepEqual(
    parsePreviewShadowOwnerDecisionArtifactJson(json),
    artifact()
  );
  assert.throws(
    () =>
      parsePreviewShadowOwnerDecisionArtifactJson(
        json.replace(
          `"contract":"${PREVIEW_SHADOW_OWNER_DECISION_CONTRACT}"`,
          `"contract":"${PREVIEW_SHADOW_OWNER_DECISION_CONTRACT}","contract":"${PREVIEW_SHADOW_OWNER_DECISION_CONTRACT}"`
        )
      ),
    /artifact_invalid/
  );
  assert.deepEqual(
    parsePreviewShadowOwnerDecisionArtifactJson(
      `${json}${" ".repeat(
        PREVIEW_SHADOW_OWNER_DECISION_MAX_BYTES -
          Buffer.byteLength(json, "utf8")
      )}`
    ),
    artifact()
  );
  assert.throws(
    () =>
      parsePreviewShadowOwnerDecisionArtifactJson(
        " ".repeat(PREVIEW_SHADOW_OWNER_DECISION_MAX_BYTES + 1)
      ),
    /artifact_invalid/
  );
  assert.throws(
    () =>
      parsePreviewShadowOwnerDecisionArtifactJson(
        JSON.stringify(Array.from({ length: 65 }, () => 0))
      ),
    /artifact_invalid/
  );
  assert.throws(
    () =>
      parsePreviewShadowOwnerDecisionArtifactJson(
        `${"[".repeat(34)}0${"]".repeat(34)}`
      ),
    /artifact_invalid/
  );

  const withSymbol = { ...artifact(), [Symbol("hidden")]: true };
  const withHidden = { ...artifact() };
  Object.defineProperty(withHidden, "hidden", { value: true });
  const withGetter = { ...artifact() };
  Object.defineProperty(withGetter, "payload", {
    enumerable: true,
    get() {
      return payload();
    },
  });
  for (const hostile of [withSymbol, withHidden, withGetter]) {
    assert.throws(
      () => verify({ artifact: hostile }),
      /^Error: preview_shadow_/
    );
  }

  const proxy = new Proxy(artifact(), {
    ownKeys() {
      throw new Error("raw-owner-signature-secret");
    },
  });
  assert.throws(
    () => verify({ artifact: proxy }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^preview_shadow_/);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }
  );
});

test("direct artifacts are bounded before registry parsing, dates, base64, or crypto", () => {
  let registryReads = 0;
  const hostileRegistry = new Proxy(registry(), {
    ownKeys() {
      registryReads += 1;
      throw new Error("raw-owner-key-secret");
    },
  });
  const hugeValues = [
    {
      ...artifact(),
      signature: { ...artifact().signature, value: "A".repeat(1_000_000) },
    },
    {
      ...artifact(),
      payload: { ...payload(), owner_decided_at: "2".repeat(1_000_000) },
    },
    {
      ...artifact(),
      payload: {
        ...payload(),
        owner_decision_reference: "r".repeat(1_000_000),
      },
    },
    {
      ...artifact(),
      payload: { ...payload(), signing_key_id: "k".repeat(1_000_000) },
    },
    {
      ...artifact(),
      payload: { ...payload(), authorization_nonce: "d".repeat(1_000_000) },
    },
    {
      ...artifact(),
      payload: {
        ...payload(),
        target_environment: "e".repeat(1_000_000) as never,
      },
    },
  ];
  for (const candidate of hugeValues) {
    assert.throws(
      () => verify({ artifact: candidate, keyRegistry: hostileRegistry }),
      /preview_shadow_owner_decision_artifact_invalid/
    );
  }
  assert.equal(registryReads, 0);

  assert.throws(
    () =>
      verify({
        authorization: {
          ...authorization(),
          owner_decided_at: "2".repeat(1_000_000),
        },
        keyRegistry: hostileRegistry,
      }),
    /preview_shadow_authorization_invalid/
  );
  assert.equal(registryReads, 0);
  for (const timestampKey of ["notBefore", "notAfter"] as const) {
    assert.throws(
      () =>
        verify({
          keyRegistry: {
            ...registry(),
            keys: [
              {
                ...registry().keys[0]!,
                [timestampKey]: "2".repeat(1_000_000),
              },
            ],
          },
        }),
      /preview_shadow_owner_key_registry_invalid/
    );
  }

  const noncanonicalBase64 = {
    ...artifact(),
    signature: {
      ...artifact().signature,
      value: `${"A".repeat(85)}B==`,
    },
  };
  assert.throws(
    () => verify({ artifact: noncanonicalBase64 }),
    /preview_shadow_owner_decision_artifact_invalid/
  );
});

test("snapshots caller inputs once and never re-reads a mutable authorization", () => {
  const candidate = authorization();
  let reads = 0;
  const hostile = {
    ...candidate,
  } as AdaptiveInterviewerPreviewShadowAuthorization;
  Object.defineProperty(hostile, "candidate_git_sha", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? CANDIDATE_SHA : "b".repeat(40);
    },
  });
  assert.throws(
    () => verify({ authorization: hostile }),
    /preview_shadow_authorization_invalid/
  );
  assert.equal(reads, 0);
});

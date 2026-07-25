import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import checkedInOwnerKeyRegistry from "../../config/evaluation-calibration-owner-keys.json";
import {
  CALIBRATION_OWNER_APPROVAL_DECISION,
  CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
  CALIBRATION_OWNER_ID,
  CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
  CALIBRATION_OWNER_ROLE,
  SAV_248_V10_APPROVED_RUN_ID,
  SAV_248_V10_PREDECESSOR_AUTHORITIES,
  assertCalibrationOwnerAuthorizationMatchesPlan,
  calibrationOwnerAuthorizationSignatureMessage,
  canonicalCalibrationOwnerAuthorizationJson,
  loadCalibrationOwnerAuthorization,
  verifyCalibrationOwnerAuthorization,
  type CalibrationOwnerAuthorizationArtifact,
  type CalibrationOwnerAuthorizationPayload,
  type CalibrationOwnerKeyRegistry,
} from "./calibration-owner-authorization";
import { assertCalibrationSpendAuthorizationExecutable } from "./calibration-run-ledger";

const NOW = new Date("2026-07-20T00:10:00.000Z");
const KEY_ID = "owner-calibration-2026-01";
const CHECKED_IN_KEY_ID = "meelni-owner-2026-07";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

test("an active human-owner signature authorizes only its exact bounded plan", () => {
  const artifact = signedArtifact();
  const verified = verifyCalibrationOwnerAuthorization({
    artifact,
    keyRegistry: registry(),
    now: NOW,
  });

  assert.doesNotThrow(() =>
    assertCalibrationSpendAuthorizationExecutable(verified.authorization)
  );
  assert.deepEqual(verified.approvedPlan, {
    planHash: "a".repeat(64),
    plannedProviderCalls: 64,
    plannedPhysicalHttpAttempts: 64,
    plannedWorstCaseNanoUsd: 2_308_945_000,
  });
  assert.equal(
    verified.authorization.authorizationStatus,
    "approved_by_human_product_owner"
  );
  assert.equal(verified.authorization.ownerId, "saviii");
  assert.equal(verified.authorization.maximumSpendUsd, 3);
  assert.equal(verified.authorization.customerTranscriptsAllowed, false);
  assert.equal(verified.authorization.productionDataAllowed, false);
  assert.equal(verified.authorization.historicalAuthoritiesReusable, false);

  assert.doesNotThrow(() =>
    assertCalibrationOwnerAuthorizationMatchesPlan(
      verified,
      {
        planHash: artifact.payload.planHash,
        plannedCalls: artifact.payload.plannedProviderCalls,
        plannedWorstCaseNanoUsd: artifact.payload.plannedWorstCaseNanoUsd,
        reviewedSourceCommit: artifact.payload.reviewedSourceCommit,
      },
      NOW
    )
  );
});

test("the owner envelope is domain separated and rejects unverified copies", () => {
  const artifact = signedArtifact();
  artifact.signature.value = sign(
    null,
    Buffer.from(canonicalCalibrationOwnerAuthorizationJson(artifact.payload)),
    privateKey
  ).toString("base64");
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact,
        keyRegistry: registry(),
        now: NOW,
      }),
    /signature_mismatch/
  );

  const verified = verifyCalibrationOwnerAuthorization({
    artifact: signedArtifact(),
    keyRegistry: registry(),
    now: NOW,
  });
  assert.throws(
    () =>
      assertCalibrationSpendAuthorizationExecutable({
        ...verified.authorization,
      }),
    /provenance_unverified/
  );
  assert.throws(
    () =>
      assertCalibrationOwnerAuthorizationMatchesPlan(
        { ...verified },
        {
          planHash: artifact.payload.planHash,
          plannedCalls: artifact.payload.plannedProviderCalls,
          plannedWorstCaseNanoUsd: artifact.payload.plannedWorstCaseNanoUsd,
          reviewedSourceCommit: artifact.payload.reviewedSourceCommit,
        },
        NOW
      ),
    /handoff_unverified/
  );
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(Object.isFrozen(verified.approvedPlan), true);
  assert.equal(Object.isFrozen(verified.authorization), true);
});

test("schema and signature mutations fail closed", () => {
  const mutations: Array<
    (artifact: CalibrationOwnerAuthorizationArtifact) => void
  > = [
    (artifact) => (artifact.contract = "wrong" as typeof artifact.contract),
    (artifact) => Object.assign(artifact, { unexpected: "field" }) as unknown,
    (artifact) => (artifact.payload.planHash = "b".repeat(64)),
    (artifact) => (artifact.payload.reviewedSourceCommit = "c".repeat(40)),
    (artifact) => (artifact.payload.plannedProviderCalls = 63),
    (artifact) => (artifact.payload.plannedWorstCaseNanoUsd -= 1),
    (artifact) => (artifact.payload.expiresAt = "2026-07-20T00:29:00.000Z"),
    (artifact) => (artifact.signature.keyId = "other-key"),
    (artifact) => (artifact.signature.value = "A".repeat(88)),
  ];

  for (const mutate of mutations) {
    const artifact = signedArtifact();
    mutate(artifact);
    assert.throws(() =>
      verifyCalibrationOwnerAuthorization({
        artifact,
        keyRegistry: registry(),
        now: NOW,
      })
    );
  }
});

test("the checked-in calibration owner registry trusts only public verification material", () => {
  const payload = {
    ...validPayload(),
    signingKeyId: CHECKED_IN_KEY_ID,
    issuedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-22T00:30:00.000Z",
  };
  const artifact: CalibrationOwnerAuthorizationArtifact = {
    contract: CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: CHECKED_IN_KEY_ID,
      value: Buffer.alloc(64).toString("base64"),
    },
  };

  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact,
        keyRegistry: checkedInOwnerKeyRegistry,
        now: new Date("2026-07-22T00:10:00.000Z"),
      }),
    /signature_mismatch/
  );
});

test("even a valid owner signature cannot widen the accepted run contract", () => {
  const mutations: Array<
    (payload: CalibrationOwnerAuthorizationPayload) => void
  > = [
    (payload) =>
      (payload.runId = SAV_248_V10_PREDECESSOR_AUTHORITIES[1]
        .runId as typeof payload.runId),
    (payload) => (payload.ownerId = "agent" as typeof payload.ownerId),
    (payload) => (payload.ownerRole = "agent" as typeof payload.ownerRole),
    (payload) =>
      (payload.approvalDecision =
        "DELEGATED" as typeof payload.approvalDecision),
    (payload) => (payload.ownerLaunchDecision = "GO" as unknown as null),
    (payload) => (payload.maximumProviderCalls = 95 as 96),
    (payload) => (payload.maximumPhysicalHttpAttempts = 95 as 96),
    (payload) => (payload.maximumSpendNanoUsd = 3_000_000_001 as 3_000_000_000),
    (payload) => (payload.plannedProviderCalls = 97),
    (payload) => (payload.plannedPhysicalHttpAttempts = 63),
    (payload) => (payload.plannedWorstCaseNanoUsd = 3_000_000_001),
    (payload) =>
      (payload.fixturePolicy = "customer_data" as typeof payload.fixturePolicy),
    (payload) => (payload.customerTranscriptsAllowed = true as false),
    (payload) => (payload.productionDataAllowed = true as false),
    (payload) => (payload.historicalAuthoritiesReusable = true as false),
    (payload) =>
      (payload.predecessorAuthorities =
        [] as unknown as typeof payload.predecessorAuthorities),
  ];

  for (const mutate of mutations) {
    const payload = validPayload();
    mutate(payload);
    const artifact = signedArtifact(payload);
    assert.throws(() =>
      verifyCalibrationOwnerAuthorization({
        artifact,
        keyRegistry: registry(),
        now: NOW,
      })
    );
  }
});

test("authorization, approval, and key validity windows are fail closed", () => {
  const future = signedArtifact({
    ...validPayload(),
    issuedAt: "2026-07-20T00:11:00.000Z",
    expiresAt: "2026-07-20T00:20:00.000Z",
  });
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact: future,
        keyRegistry: registry(),
        now: NOW,
      }),
    /not_yet_valid/
  );

  const expired = signedArtifact({
    ...validPayload(),
    issuedAt: "2026-07-19T23:40:00.000Z",
    expiresAt: "2026-07-20T00:10:00.000Z",
  });
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact: expired,
        keyRegistry: registry(),
        now: NOW,
      }),
    /expired/
  );

  const tooLong = signedArtifact({
    ...validPayload(),
    issuedAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-20T00:30:00.001Z",
  });
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact: tooLong,
        keyRegistry: registry(),
        now: NOW,
      }),
    /ttl_invalid/
  );

  const fractionalIssueTime = signedArtifact({
    ...validPayload(),
    issuedAt: "2026-07-20T00:00:00.001Z",
  });
  assert.throws(
    () =>
      verifyCalibrationOwnerAuthorization({
        artifact: fractionalIssueTime,
        keyRegistry: registry(),
        now: NOW,
      }),
    /issued_at_invalid/
  );

  for (const keyRegistry of [
    registry({ status: "revoked" }),
    registry({ notAfter: "2026-07-20T00:10:00.000Z" }),
    registry({ keyId: "another-key" }),
  ]) {
    assert.throws(() =>
      verifyCalibrationOwnerAuthorization({
        artifact: signedArtifact(),
        keyRegistry,
        now: NOW,
      })
    );
  }
});

test("plan mutations cannot reuse one valid owner approval", () => {
  const verified = verifyCalibrationOwnerAuthorization({
    artifact: signedArtifact(),
    keyRegistry: registry(),
    now: NOW,
  });
  for (const plan of [
    {
      planHash: "b".repeat(64),
      plannedCalls: 64,
      plannedWorstCaseNanoUsd: 2_308_945_000,
      reviewedSourceCommit: "b".repeat(40),
    },
    {
      planHash: "a".repeat(64),
      plannedCalls: 63,
      plannedWorstCaseNanoUsd: 2_308_945_000,
      reviewedSourceCommit: "b".repeat(40),
    },
    {
      planHash: "a".repeat(64),
      plannedCalls: 64,
      plannedWorstCaseNanoUsd: 2_273_984_999,
      reviewedSourceCommit: "b".repeat(40),
    },
    {
      planHash: "a".repeat(64),
      plannedCalls: 64,
      plannedWorstCaseNanoUsd: 2_308_945_000,
      reviewedSourceCommit: "c".repeat(40),
    },
  ]) {
    assert.throws(
      () => assertCalibrationOwnerAuthorizationMatchesPlan(verified, plan, NOW),
      /plan_mismatch/
    );
  }

  assert.throws(
    () =>
      assertCalibrationOwnerAuthorizationMatchesPlan(
        verified,
        {
          planHash: "a".repeat(64),
          plannedCalls: 64,
          plannedWorstCaseNanoUsd: 2_308_945_000,
          reviewedSourceCommit: "b".repeat(40),
        },
        new Date("2026-07-20T00:30:00.000Z")
      ),
    /expired/
  );
});

test("the loader accepts only a small private external regular file", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-owner-auth-"));
  const repositoryRoot = join(directory, "repo");
  const externalRoot = join(directory, "external");
  mkdirSync(repositoryRoot);
  mkdirSync(externalRoot);
  const path = join(externalRoot, "authorization.json");
  const symlink = join(externalRoot, "authorization-link.json");
  const hardLink = join(externalRoot, "authorization-hard-link.json");
  const inside = join(repositoryRoot, "authorization.json");
  const oversized = join(externalRoot, "oversized.json");
  try {
    writeFileSync(path, JSON.stringify(signedArtifact()), { mode: 0o600 });
    const verified = await loadCalibrationOwnerAuthorization({
      authorizationPath: path,
      repositoryRoot,
      keyRegistry: registry(),
      now: NOW,
    });
    assert.equal(verified.authorization.ownerId, CALIBRATION_OWNER_ID);

    chmodSync(path, 0o644);
    await assert.rejects(
      () =>
        loadCalibrationOwnerAuthorization({
          authorizationPath: path,
          repositoryRoot,
          keyRegistry: registry(),
          now: NOW,
        }),
      /file_insecure/
    );
    chmodSync(path, 0o600);
    symlinkSync(path, symlink);
    await assert.rejects(
      () =>
        loadCalibrationOwnerAuthorization({
          authorizationPath: symlink,
          repositoryRoot,
          keyRegistry: registry(),
          now: NOW,
        }),
      /file_insecure/
    );
    linkSync(path, hardLink);
    await assert.rejects(
      () =>
        loadCalibrationOwnerAuthorization({
          authorizationPath: path,
          repositoryRoot,
          keyRegistry: registry(),
          now: NOW,
        }),
      /file_insecure/
    );
    rmSync(hardLink);
    writeFileSync(inside, JSON.stringify(signedArtifact()), { mode: 0o600 });
    await assert.rejects(
      () =>
        loadCalibrationOwnerAuthorization({
          authorizationPath: inside,
          repositoryRoot,
          keyRegistry: registry(),
          now: NOW,
        }),
      /must_be_external/
    );
    writeFileSync(oversized, "x".repeat(65 * 1_024), { mode: 0o600 });
    await assert.rejects(
      () =>
        loadCalibrationOwnerAuthorization({
          authorizationPath: oversized,
          repositoryRoot,
          keyRegistry: registry(),
          now: NOW,
        }),
      /file_too_large/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validPayload(): CalibrationOwnerAuthorizationPayload {
  return {
    authorizationId: "sav248_v10_auth_0123456789abcdef0123456789abcdef",
    runId: SAV_248_V10_APPROVED_RUN_ID,
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    approvalDecision: CALIBRATION_OWNER_APPROVAL_DECISION,
    ownerLaunchDecision: null,
    signingKeyId: KEY_ID,
    reviewedSourceCommit: "b".repeat(40),
    planHash: "a".repeat(64),
    plannedProviderCalls: 64,
    plannedPhysicalHttpAttempts: 64,
    plannedWorstCaseNanoUsd: 2_308_945_000,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendNanoUsd: 3_000_000_000,
    singleAggregateRun: true,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V10_PREDECESSOR_AUTHORITIES,
    issuedAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-07-20T00:30:00.000Z",
  };
}

function signedArtifact(
  payload: CalibrationOwnerAuthorizationPayload = validPayload(),
  signingKey: KeyObject = privateKey
): CalibrationOwnerAuthorizationArtifact {
  return {
    contract: CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: payload.signingKeyId,
      value: sign(
        null,
        calibrationOwnerAuthorizationSignatureMessage(payload),
        signingKey
      ).toString("base64"),
    },
  };
}

function registry(
  patch: Partial<CalibrationOwnerKeyRegistry["keys"][number]> = {}
): CalibrationOwnerKeyRegistry {
  return {
    contract: CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
    ownerId: CALIBRATION_OWNER_ID,
    keys: [
      {
        algorithm: "ed25519",
        keyId: KEY_ID,
        status: "active",
        notBefore: "2026-07-19T00:00:00.000Z",
        notAfter: "2027-07-19T00:00:00.000Z",
        publicKeyPem: publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
        ...patch,
      },
    ],
  };
}

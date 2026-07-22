import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
  CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
} from "@/lib/evaluation/calibration-owner-authorization";

import { runCalibrationOwnerAuthorizationCli } from "./run-evaluation-calibration-owner-authorization";

const REPO_ROOT = process.cwd();
const APPROVAL_PATH = join(
  REPO_ROOT,
  "docs",
  "evidence",
  "sav-198-adjudication-approval.json"
);
const REVIEWED_SOURCE_COMMIT = "f6ff63ce2f9b03542b28ffdb591c96434d436e1f";
const AUTHORIZATION_ID = "sav248_v3_auth_0123456789abcdef0123456789abcdef";
const KEY_ID = "owner-calibration-test-2026-07";
const ISSUED_AT = "2026-07-22T04:20:00.000Z";
const EXPIRES_AT = "2026-07-22T04:50:00.000Z";

test("calibration owner CLI prepares, signs, and verifies an exact plan", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-calibration-owner-"));
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPath = join(directory, "owner-key.pem");
    writeFileSync(privateKeyPath, exportPrivateKey(privateKey), {
      mode: 0o600,
    });
    chmodSync(privateKeyPath, 0o600);
    const registryPath = join(directory, "owner-registry.json");
    writeFileSync(registryPath, JSON.stringify(registry(publicKey), null, 2), {
      mode: 0o600,
    });
    const requestPath = join(directory, "unsigned-request.json");
    const artifactPath = join(directory, "signed-artifact.json");
    const reportPath = join(directory, "verification-report.json");

    await runCli([
      "prepare",
      "--adjudication-approval",
      APPROVAL_PATH,
      "--authorization-id",
      AUTHORIZATION_ID,
      "--reviewed-source-commit",
      REVIEWED_SOURCE_COMMIT,
      "--signing-key-id",
      KEY_ID,
      "--issued-at",
      ISSUED_AT,
      "--expires-at",
      EXPIRES_AT,
      "--output-path",
      requestPath,
    ]);
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    assert.equal(
      request.contract,
      "meelni.evaluation-calibration-owner-authorization-request.v1"
    );
    assert.equal(request.payload.reviewedSourceCommit, REVIEWED_SOURCE_COMMIT);
    assert.equal(request.payload.plannedProviderCalls, 64);
    assert.equal(request.payload.plannedPhysicalHttpAttempts, 64);
    assert.equal(request.payload.maximumSpendNanoUsd, 3_000_000_000);
    assert.match(request.payload.planHash, /^[0-9a-f]{64}$/);
    assert.match(request.signatureMessageSha256, /^[0-9a-f]{64}$/);

    await runCli([
      "sign",
      "--payload-path",
      requestPath,
      "--artifact-path",
      artifactPath,
      "--key-id",
      KEY_ID,
      "--private-key-path",
      privateKeyPath,
    ]);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.equal(artifact.contract, CALIBRATION_OWNER_AUTHORIZATION_CONTRACT);
    assert.equal(artifact.signature.keyId, KEY_ID);
    assert.equal(artifact.signature.algorithm, "ed25519");

    await runCli([
      "verify",
      "--artifact-path",
      artifactPath,
      "--adjudication-approval",
      APPROVAL_PATH,
      "--reviewed-source-commit",
      REVIEWED_SOURCE_COMMIT,
      "--key-registry-path",
      registryPath,
      "--now",
      "2026-07-22T04:25:00.000Z",
      "--output-path",
      reportPath,
    ]);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(
      report.contract,
      "meelni.evaluation-calibration-owner-authorization-verification-report.v1"
    );
    assert.equal(report.authorizationId, AUTHORIZATION_ID);
    assert.equal(report.reviewedSourceCommit, REVIEWED_SOURCE_COMMIT);
    assert.equal(report.planHash, request.payload.planHash);
    assert.equal(report.providerCallsExecuted, false);
    assert.equal(report.ledgerActivated, false);
    assert.equal(report.launchAuthorized, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("calibration owner CLI rejects source drift before reporting success", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-calibration-owner-"));
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPath = join(directory, "owner-key.pem");
    writeFileSync(privateKeyPath, exportPrivateKey(privateKey), {
      mode: 0o600,
    });
    chmodSync(privateKeyPath, 0o600);
    const registryPath = join(directory, "owner-registry.json");
    writeFileSync(registryPath, JSON.stringify(registry(publicKey), null, 2), {
      mode: 0o600,
    });
    const requestPath = join(directory, "unsigned-request.json");
    const artifactPath = join(directory, "signed-artifact.json");
    await runCli([
      "prepare",
      "--adjudication-approval",
      APPROVAL_PATH,
      "--authorization-id",
      AUTHORIZATION_ID,
      "--reviewed-source-commit",
      REVIEWED_SOURCE_COMMIT,
      "--signing-key-id",
      KEY_ID,
      "--issued-at",
      ISSUED_AT,
      "--expires-at",
      EXPIRES_AT,
      "--output-path",
      requestPath,
    ]);
    await runCli([
      "sign",
      "--payload-path",
      requestPath,
      "--artifact-path",
      artifactPath,
      "--key-id",
      KEY_ID,
      "--private-key-path",
      privateKeyPath,
    ]);
    await assert.rejects(
      () =>
        runCli([
          "verify",
          "--artifact-path",
          artifactPath,
          "--adjudication-approval",
          APPROVAL_PATH,
          "--reviewed-source-commit",
          "a".repeat(40),
          "--key-registry-path",
          registryPath,
          "--now",
          "2026-07-22T04:25:00.000Z",
        ]),
      /source_commit_mismatch/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function runCli(argv: string[]): Promise<void> {
  let stderr = "";
  const status = await runCalibrationOwnerAuthorizationCli({
    argv,
    repoRoot: REPO_ROOT,
    stdout: { write: () => true },
    stderr: {
      write: (chunk: string) => {
        stderr += chunk;
        return true;
      },
    },
  });
  assert.equal(status, 0, stderr);
}

function registry(publicKey: KeyObject) {
  return {
    contract: CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
    ownerId: "saviii",
    keys: [
      {
        algorithm: "ed25519",
        keyId: KEY_ID,
        status: "active",
        notBefore: "2026-07-21T00:00:00.000Z",
        notAfter: "2027-07-21T00:00:00.000Z",
        publicKeyPem: publicKey.export({
          format: "pem",
          type: "spki",
        }),
      },
    ],
  };
}

function exportPrivateKey(privateKey: KeyObject): string {
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

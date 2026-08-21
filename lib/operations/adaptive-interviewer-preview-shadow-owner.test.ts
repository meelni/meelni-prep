import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
  PREVIEW_SHADOW_OWNER_ID,
} from "../security/adaptive-interviewer-preview-shadow-owner-decision";
import {
  preparePreviewShadowOwnerPacket,
  signPreviewShadowOwnerPacket,
  verifyPreviewShadowOwnerPacket,
} from "./adaptive-interviewer-preview-shadow-owner";

const CANDIDATE = "a".repeat(40);
const NOW = new Date("2026-08-20T20:00:00.000Z");
const KEY_ID = "synthetic-preview-shadow-owner";

test("prepares, signs, and verifies one exact external Preview-shadow packet", async () => {
  const fixture = await ownerFixture();
  const prepared = await preparePreviewShadowOwnerPacket({
    outputDirectory: fixture.packetDirectory,
    ownerDecisionReference: "linear:SAV-482:owner:synthetic",
    keyId: KEY_ID,
    repoRoot: process.cwd(),
    now: NOW,
    ttlMs: 60 * 60 * 1_000,
    authorizationNonce: "b".repeat(64),
    resolveCandidate: () => CANDIDATE,
  });

  assert.equal(prepared.candidate_git_sha, CANDIDATE);
  assert.equal(prepared.preview_influence_authorized, false);
  assert.equal(prepared.production_authorized, false);
  assert.equal(prepared.default_on_authorized, false);
  assert.equal(prepared.launch_go_no_go_authorized, false);

  const signed = await signPreviewShadowOwnerPacket({
    packetDirectory: fixture.packetDirectory,
    artifactPath: fixture.artifactPath,
    keyRegistryPath: fixture.registryPath,
    privateKeyPath: fixture.privateKeyPath,
    repoRoot: process.cwd(),
    now: NOW,
  });
  const verified = await verifyPreviewShadowOwnerPacket({
    packetDirectory: fixture.packetDirectory,
    artifactPath: fixture.artifactPath,
    keyRegistryPath: fixture.registryPath,
    repoRoot: process.cwd(),
    now: NOW,
    resolveCandidate: () => CANDIDATE,
  });

  assert.deepEqual(verified, signed);
  assert.equal(verified.authorization_id, prepared.authorization_id);
  const artifact = await readFile(fixture.artifactPath, "utf8");
  const privateKey = await readFile(fixture.privateKeyPath, "utf8");
  assert.doesNotMatch(artifact, /PRIVATE KEY/);
  assert.doesNotMatch(artifact, new RegExp(privateKey.trim()));
});

test("verification rejects a different repository candidate and create-only replay", async () => {
  const fixture = await ownerFixture();
  const input = {
    outputDirectory: fixture.packetDirectory,
    ownerDecisionReference: "linear:SAV-482:owner:synthetic",
    keyId: KEY_ID,
    repoRoot: process.cwd(),
    now: NOW,
    authorizationNonce: "c".repeat(64),
    resolveCandidate: () => CANDIDATE,
  };
  await preparePreviewShadowOwnerPacket(input);
  await assert.rejects(
    () => preparePreviewShadowOwnerPacket(input),
    /already exists|EEXIST/
  );
  await signPreviewShadowOwnerPacket({
    packetDirectory: fixture.packetDirectory,
    artifactPath: fixture.artifactPath,
    keyRegistryPath: fixture.registryPath,
    privateKeyPath: fixture.privateKeyPath,
    repoRoot: process.cwd(),
    now: NOW,
  });
  await assert.rejects(() =>
    verifyPreviewShadowOwnerPacket({
      packetDirectory: fixture.packetDirectory,
      artifactPath: fixture.artifactPath,
      keyRegistryPath: fixture.registryPath,
      repoRoot: process.cwd(),
      now: NOW,
      resolveCandidate: () => "d".repeat(40),
    })
  );
});

async function ownerFixture() {
  const directory = await mkdtemp(join(tmpdir(), "meelni-sav-482-owner-"));
  await chmod(directory, 0o700);
  const packetDirectory = join(directory, "packet");
  await (await import("node:fs/promises")).mkdir(packetDirectory, {
    mode: 0o700,
  });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPath = join(directory, "owner.pem");
  const registryPath = join(directory, "keys.json");
  const artifactPath = join(packetDirectory, "owner-decision.json");
  await writeFile(
    privateKeyPath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600 }
  );
  await writeFile(
    registryPath,
    `${JSON.stringify({
      contract: PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
      ownerId: PREVIEW_SHADOW_OWNER_ID,
      keys: [
        {
          algorithm: "ed25519",
          keyId: KEY_ID,
          notAfter: "2027-01-01T00:00:00.000Z",
          notBefore: "2026-01-01T00:00:00.000Z",
          publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
          status: "active",
        },
      ],
    })}\n`,
    { mode: 0o600 }
  );
  return {
    packetDirectory,
    privateKeyPath,
    registryPath,
    artifactPath,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalEnvironmentForEnvFile,
  getSupabaseEnvironmentIdentityPolicy,
  isLoopbackDatabaseUrl,
} from "./supabase-environment-guard.mjs";

const previewRef = "previewprojectref123";
const productionRef = "productionproject123";

test("loopback database workflows do not require shared environment identity", () => {
  for (const databaseUrl of [
    "postgresql://postgres:postgres@localhost:5432/meelni_test",
    "postgresql://postgres:postgres@127.0.0.1:5432/meelni_test",
    "postgresql://postgres:postgres@[::1]:5432/meelni_test",
  ]) {
    const policy = getSupabaseEnvironmentIdentityPolicy({ databaseUrl });
    assert.equal(policy.allowed, true);
    assert.equal(policy.environmentIdentity, "local");
    assert.equal(policy.local, true);
    assert.equal(isLoopbackDatabaseUrl(databaseUrl), true);
  }
});

test("Preview must differ from the declared Production Supabase project", () => {
  assert.equal(
    getSupabaseEnvironmentIdentityPolicy({
      databaseUrl: databaseUrl(previewRef),
      environment: "preview",
      expectedEnvironment: "preview",
      productionProjectRef: productionRef,
    }).allowed,
    true
  );

  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(productionRef),
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /Preview database target matches/);
});

test("Production must match the declared Production Supabase project", () => {
  assert.equal(
    getSupabaseEnvironmentIdentityPolicy({
      databaseUrl: databaseUrl(productionRef),
      environment: "production",
      expectedEnvironment: "production",
      productionProjectRef: productionRef,
    }).allowed,
    true
  );

  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(previewRef),
    environment: "production",
    expectedEnvironment: "production",
    productionProjectRef: productionRef,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /Production database target does not match/);
});

test("remote targets fail closed without valid environment identity metadata", () => {
  for (const input of [
    {
      databaseUrl: databaseUrl(previewRef),
      productionProjectRef: productionRef,
    },
    {
      databaseUrl: databaseUrl(previewRef),
      environment: "preview",
      expectedEnvironment: "preview",
    },
    {
      databaseUrl: databaseUrl(previewRef),
      environment: "preview",
      expectedEnvironment: "preview",
      productionProjectRef: "not-a-project-ref",
    },
    {
      databaseUrl:
        "postgresql://postgres:secret@database.example.invalid:5432/postgres",
      environment: "preview",
      expectedEnvironment: "preview",
      productionProjectRef: productionRef,
    },
  ]) {
    assert.equal(getSupabaseEnvironmentIdentityPolicy(input).allowed, false);
  }
});

test("remote identity rejects canonical-file and Vercel marker disagreements", () => {
  const wrongFile = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(productionRef),
    environment: "production",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
    vercelEnvironment: "preview",
  });
  assert.equal(wrongFile.allowed, false);
  assert.match(wrongFile.reason, /does not match expected preview/);

  const wrongVercelMarker = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(previewRef),
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
    vercelEnvironment: "production",
  });
  assert.equal(wrongVercelMarker.allowed, false);
  assert.match(wrongVercelMarker.reason, /VERCEL_ENV=production/);
});

test("canonical env filenames have deterministic shared identities", () => {
  assert.equal(canonicalEnvironmentForEnvFile(".env.local"), "preview");
  assert.equal(
    canonicalEnvironmentForEnvFile(".env.production.local"),
    "production"
  );
  assert.equal(canonicalEnvironmentForEnvFile("/tmp/copied.env"), undefined);
});

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}

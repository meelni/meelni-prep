import assert from "node:assert/strict";
import test from "node:test";

import {
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
      productionProjectRef: productionRef,
    }).allowed,
    true
  );

  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(productionRef),
    environment: "preview",
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
      productionProjectRef: productionRef,
    }).allowed,
    true
  );

  const policy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: databaseUrl(previewRef),
    environment: "production",
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
    },
    {
      databaseUrl: databaseUrl(previewRef),
      environment: "preview",
      productionProjectRef: "not-a-project-ref",
    },
    {
      databaseUrl:
        "postgresql://postgres:secret@database.example.invalid:5432/postgres",
      environment: "preview",
      productionProjectRef: productionRef,
    },
  ]) {
    assert.equal(getSupabaseEnvironmentIdentityPolicy(input).allowed, false);
  }
});

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}

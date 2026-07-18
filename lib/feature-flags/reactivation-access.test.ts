import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { resolveReactivationAccess } from "./reactivation-access";
import { resolveServerGate } from "./server-resolver";

const user = { id: "20000000-0000-4000-8000-000000000001" };

test("reactivation access fails closed when no gate or default is configured", async () => {
  const result = await resolveReactivationAccess({
    user,
    env: { NODE_ENV: "production" },
  });
  assert.deepEqual(result, { source: "configured-default", value: false });
});

test("reactivation access honors the explicit configured default", async () => {
  const result = await resolveReactivationAccess({
    user,
    env: {
      NODE_ENV: "production",
      MEELNI_REACTIVATION_DEFAULT: "true",
      MEELNI_RELAUNCH_PHASE: "launched",
      NEXT_PUBLIC_STATSIG_ENVIRONMENT: "production",
      VERCEL_ENV: "production",
    },
  });
  assert.equal(result.value, true);
});

test("reactivation access forwards immutable Preview rehearsal identity", async () => {
  const resolveGate = mock.fn<typeof resolveServerGate>(async () => ({
    source: "statsig" as const,
    value: true,
  }));
  const deploymentCommitSha = "a".repeat(40);

  const result = await resolveReactivationAccess({
    user,
    resolveGate,
    env: {
      NODE_ENV: "production",
      MEELNI_REHEARSAL_COMMIT_SHA: deploymentCommitSha,
      MEELNI_RELAUNCH_PHASE: "rehearsal",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-preview",
      NEXT_PUBLIC_STATSIG_ENVIRONMENT: "preview",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/sav-184-rebuild-current",
      VERCEL_GIT_COMMIT_SHA: deploymentCommitSha,
    },
  });

  assert.equal(result.value, true);
  assert.equal(resolveGate.mock.calls.length, 1);
  assert.deepEqual(resolveGate.mock.calls[0].arguments[0], {
    apiUrl: undefined,
    clientKey: "client-preview",
    deploymentBranch: "codex/sav-184-rebuild-current",
    deploymentCommitSha,
    deploymentTarget: "preview",
    environmentTier: "preview",
    fallbackValue: false,
    gateName: "meelni_reactivation_access",
    rehearsalCommitSha: deploymentCommitSha,
    relaunchPhase: "rehearsal",
    user: {
      userID: "authenticated-launch-state",
      custom: {
        anonymous_id: "authenticated-launch-state",
        local_dev_id: "authenticated-launch-state",
        logged_in: true,
      },
    },
  });
});

test("public launch-state checks use a stable non-user identity", async () => {
  const resolveGate = mock.fn<typeof resolveServerGate>(async () => ({
    source: "statsig" as const,
    value: false,
  }));

  await resolveReactivationAccess({
    user: null,
    resolveGate,
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-production",
      NEXT_PUBLIC_STATSIG_ENVIRONMENT: "production",
      VERCEL_ENV: "production",
    },
  });

  assert.equal(resolveGate.mock.calls.length, 1);
  assert.deepEqual(resolveGate.mock.calls[0].arguments[0].user, {
    userID: "public-launch-state",
    custom: {
      anonymous_id: "public-launch-state",
      local_dev_id: "public-launch-state",
      logged_in: false,
    },
  });
});

test("development override controls the same server-side gate", async () => {
  const result = await resolveReactivationAccess({
    user,
    localOverride: "on",
    env: { NODE_ENV: "development" },
  });
  assert.equal(result.value, true);
});

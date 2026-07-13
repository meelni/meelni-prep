import assert from "node:assert/strict";
import test from "node:test";
import type { StatsigUser } from "@statsig/js-client";

import { resolveReactivationAccess } from "./reactivation-access";

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
    },
  });
  assert.equal(result.value, true);
});

test("development override controls the same server-side gate", async () => {
  const result = await resolveReactivationAccess({
    user,
    localOverride: "on",
    env: { NODE_ENV: "development" },
  });
  assert.equal(result.value, true);
});

test("public relaunch access uses the non-identifying launch-state actor", async () => {
  let receivedUser: StatsigUser | undefined;
  const result = await resolveReactivationAccess({
    user: null,
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-test-key",
    },
    resolveGate: async (input) => {
      receivedUser = input.user;
      return { source: "statsig", value: true };
    },
  });

  assert.deepEqual(result, { source: "statsig", value: true });
  assert.deepEqual(receivedUser, { userID: "public-launch-state" });
});

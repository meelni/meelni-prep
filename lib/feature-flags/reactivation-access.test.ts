import assert from "node:assert/strict";
import test from "node:test";

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

import assert from "node:assert/strict";
import test from "node:test";

import {
  requestAccountDeletion,
  shouldShowSettingsLoading,
} from "./settings-actions";

test("settings treats idle and loading as loading-safe states", () => {
  assert.equal(shouldShowSettingsLoading("idle"), true);
  assert.equal(shouldShowSettingsLoading("loading"), true);
  assert.equal(shouldShowSettingsLoading("ready"), false);
  assert.equal(shouldShowSettingsLoading("error"), false);
});

test("account deletion reports API failures instead of throwing", async () => {
  const result = await requestAccountDeletion(async () => {
    return new Response("nope", { status: 500 });
  });

  assert.deepEqual(result, {
    ok: false,
    error: "We could not delete the account. Please try again.",
  });
});

test("account deletion reports network failures instead of throwing", async () => {
  const result = await requestAccountDeletion(async () => {
    throw new Error("network down");
  });

  assert.deepEqual(result, {
    ok: false,
    error: "We could not delete the account. Please try again.",
  });
});

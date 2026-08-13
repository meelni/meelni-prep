import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS,
  getAccountDeletionAuthDecision,
} from "./account-privacy";

const NOW = new Date("2026-07-10T16:00:00.000Z");

test("account export version includes closed feedback quality state", () => {
  assert.equal(ACCOUNT_EXPORT_SCHEMA_VERSION, "1.4.0");
});

test("account deletion accepts a recent server-verified sign-in", () => {
  assert.deepEqual(
    getAccountDeletionAuthDecision({
      lastSignInAt: new Date(
        NOW.getTime() - ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS + 1
      ).toISOString(),
      now: NOW,
    }),
    {
      allowed: true,
      authenticatedAt: "2026-07-10T15:50:00.001Z",
    }
  );
});

test("account deletion fails closed for stale, missing, invalid, or future sign-ins", () => {
  const stale = new Date(
    NOW.getTime() - ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS - 1
  ).toISOString();

  for (const lastSignInAt of [
    stale,
    null,
    "not-a-date",
    "2026-07-10T16:00:01Z",
  ]) {
    assert.deepEqual(
      getAccountDeletionAuthDecision({ lastSignInAt, now: NOW }),
      { allowed: false, reason: "reauthentication_required" }
    );
  }
});

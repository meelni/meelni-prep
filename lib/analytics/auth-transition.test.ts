import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthTransition,
  shouldEmitAuthTransition,
} from "./auth-transition";

test("auth transition classifies signup and signin without analytics traits", () => {
  const signup = createAuthTransition(
    {
      id: "user-a",
      app_metadata: { provider: "google" },
      created_at: "2026-07-10T12:00:00.000Z",
      last_sign_in_at: "2026-07-10T12:00:02.000Z",
    },
    1
  );
  assert.deepEqual(signup, {
    dedupeKey: "signup:user-a:2026-07-10T12:00:02.000Z",
    id: 1,
    method: "google",
    type: "signup",
    userId: "user-a",
  });

  const signin = createAuthTransition(
    {
      id: "user-a",
      app_metadata: { provider: "email" },
      created_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: "2026-07-10T12:00:00.000Z",
    },
    2
  );
  assert.equal(signin.type, "signin");
  assert.equal(signin.method, "email");
  assert.equal(
    shouldEmitAuthTransition(signin, "user-a", "user-a", null),
    true
  );
  assert.equal(shouldEmitAuthTransition(signin, "user-a", "user-a", 2), false);
  assert.equal(
    shouldEmitAuthTransition(signin, "user-b", "user-b", null),
    false
  );
});

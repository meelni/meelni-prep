import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableSupabaseAuthError } from "./auth-error";

test("only Supabase retryable transport failures bypass unauthorized handling", () => {
  assert.equal(
    isRetryableSupabaseAuthError({ name: "AuthRetryableFetchError" }),
    true
  );
  assert.equal(isRetryableSupabaseAuthError({ name: "AuthApiError" }), false);
  assert.equal(isRetryableSupabaseAuthError(new Error("expired")), false);
});

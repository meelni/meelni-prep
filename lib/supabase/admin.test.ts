import assert from "node:assert/strict";
import test from "node:test";

import { getSupabaseAdminEnvironment } from "./admin-environment";

test("Supabase admin environment requires a distinct server-only service key", () => {
  assert.throws(() => getSupabaseAdminEnvironment({}), /not configured/);
  assert.throws(
    () =>
      getSupabaseAdminEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "same-key",
        SUPABASE_SERVICE_ROLE_KEY: "same-key",
      }),
    /service role/
  );
  assert.deepEqual(
    getSupabaseAdminEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      SUPABASE_SERVICE_ROLE_KEY: "server-key",
    }),
    {
      url: "https://example.supabase.co",
      serviceRoleKey: "server-key",
    }
  );
});

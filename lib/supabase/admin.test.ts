import assert from "node:assert/strict";
import test from "node:test";

import { getSupabaseAdminEnvironment } from "./admin-environment";

const projectRef = "previewpreviewprevie";
const projectUrl = `https://${projectRef}.supabase.co`;

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
      NEXT_PUBLIC_SUPABASE_URL: projectUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseJwt("anon"),
      SUPABASE_SERVICE_ROLE_KEY: supabaseJwt("service_role"),
    }),
    {
      url: projectUrl,
      serviceRoleKey: supabaseJwt("service_role"),
    }
  );
});

test("Supabase admin environment rejects swapped and cross-project JWT roles", () => {
  for (const env of [
    {
      NEXT_PUBLIC_SUPABASE_URL: projectUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseJwt("service_role"),
      SUPABASE_SERVICE_ROLE_KEY: supabaseJwt("anon"),
    },
    {
      NEXT_PUBLIC_SUPABASE_URL: projectUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseJwt("anon"),
      SUPABASE_SERVICE_ROLE_KEY: supabaseJwt(
        "service_role",
        "anotherpreviewref123"
      ),
    },
  ]) {
    assert.throws(() => getSupabaseAdminEnvironment(env), /service role/);
  }
});

function supabaseJwt(
  role: "anon" | "service_role",
  ref = projectRef,
  issuer = `https://${ref}.supabase.co/auth/v1`
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: issuer,
    ref,
    role,
  })}.fixture-signature`;
}

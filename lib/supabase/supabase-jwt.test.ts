import assert from "node:assert/strict";
import test from "node:test";

import {
  readSupabaseJwtClaims,
  supabaseJwtIssuerMatchesProject,
  supabaseJwtMatchesIdentity,
} from "./supabase-jwt.mjs";

const projectRef = "previewpreviewprevie";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;

test("Supabase JWT identity requires three parts and exact role/ref/issuer", () => {
  const anon = jwt(projectRef, "anon", issuer);
  assert.deepEqual(readSupabaseJwtClaims(anon), {
    iss: issuer,
    ref: projectRef,
    role: "anon",
  });
  assert.equal(
    supabaseJwtMatchesIdentity(anon, {
      expectedProjectRef: projectRef,
      expectedRole: "anon",
      expectedIssuer: issuer,
    }),
    true
  );
  assert.equal(
    supabaseJwtMatchesIdentity(anon, {
      expectedProjectRef: projectRef,
      expectedRole: "service_role",
      expectedIssuer: issuer,
    }),
    false
  );
  assert.equal(readSupabaseJwtClaims("eyJfabricated"), undefined);
});

test("Supabase JWT issuer rejects noncanonical project auth URLs", () => {
  assert.equal(supabaseJwtIssuerMatchesProject(issuer, projectRef), true);
  assert.equal(supabaseJwtIssuerMatchesProject("supabase", projectRef), true);
  assert.equal(
    supabaseJwtIssuerMatchesProject(
      `https://${projectRef}.supabase.co/not-auth/v1`,
      projectRef
    ),
    false
  );
  assert.equal(
    supabaseJwtIssuerMatchesProject(
      `https://anotherpreviewref123.supabase.co/auth/v1`,
      projectRef
    ),
    false
  );
});

function jwt(ref: string, role: string, iss: string) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss,
    ref,
    role,
  })}.fixture-signature`;
}

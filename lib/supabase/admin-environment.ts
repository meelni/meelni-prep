import { inferSupabaseProjectRef } from "@meelni/integrations";
import {
  readSupabaseJwtClaims,
  supabaseJwtMatchesIdentity,
} from "./supabase-jwt.mjs";

type AdminEnvironment = Record<string, string | undefined>;

export function getSupabaseAdminEnvironment(
  env: AdminEnvironment = process.env
): { url: string; serviceRoleKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured");
  }
  const projectRef = inferSupabaseProjectRef(url);
  const anonClaims = readSupabaseJwtClaims(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (
    !projectRef ||
    !anonClaims?.iss ||
    !supabaseJwtMatchesIdentity(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      expectedProjectRef: projectRef,
      expectedRole: "anon",
      expectedIssuer: anonClaims.iss,
    }) ||
    !supabaseJwtMatchesIdentity(serviceRoleKey, {
      expectedProjectRef: projectRef,
      expectedRole: "service_role",
      expectedIssuer: anonClaims.iss,
    })
  ) {
    throw new Error("Supabase admin credentials must use the service role key");
  }
  return { url, serviceRoleKey };
}

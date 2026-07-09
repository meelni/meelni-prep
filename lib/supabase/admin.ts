import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdminEnvironment } from "./admin-environment";

type AdminEnvironment = Record<string, string | undefined>;

export function createAdminClient(env: AdminEnvironment = process.env) {
  const { url, serviceRoleKey } = getSupabaseAdminEnvironment(env);
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

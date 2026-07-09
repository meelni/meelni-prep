type AdminEnvironment = Record<string, string | undefined>;

export function getSupabaseAdminEnvironment(
  env: AdminEnvironment = process.env
): { url: string; serviceRoleKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured");
  }
  if (serviceRoleKey === env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase admin credentials must use the service role key");
  }
  return { url, serviceRoleKey };
}

import { isAuthSessionMissingError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function resolveAuthenticatedContactUserId(
  normalizedSubmissionEmail: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return authenticatedContactUserIdFromResult(
    { user: data.user, error },
    normalizedSubmissionEmail
  );
}

export function authenticatedContactUserIdFromResult(
  result: {
    user: { id: string; email?: string } | null;
    error: unknown;
  },
  normalizedSubmissionEmail: string
): string | null {
  if (result.error && isAuthSessionMissingError(result.error)) return null;
  if (result.error) throw result.error;
  return matchingAuthenticatedContactUserId(
    result.user,
    normalizedSubmissionEmail
  );
}

export function matchingAuthenticatedContactUserId(
  user: { id: string; email?: string } | null,
  normalizedSubmissionEmail: string
): string | null {
  if (!user?.email) return null;
  return user.email.trim().toLowerCase() === normalizedSubmissionEmail
    ? user.id
    : null;
}

import { createClient } from "@/lib/supabase/server";

export async function resolveAuthenticatedContactUserId(
  normalizedSubmissionEmail: string
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return matchingAuthenticatedContactUserId(
      data.user,
      normalizedSubmissionEmail
    );
  } catch {
    return null;
  }
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

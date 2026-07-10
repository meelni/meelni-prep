export type AuthTransitionMethod = "email" | "google";
export type AuthTransitionType = "signin" | "signup";

export interface AuthTransition {
  dedupeKey: string;
  id: number;
  method: AuthTransitionMethod;
  type: AuthTransitionType;
  userId: string;
}

interface AuthTransitionUser {
  app_metadata: { provider?: string };
  created_at: string;
  id: string;
  last_sign_in_at?: string;
}

export function createAuthTransition(
  user: AuthTransitionUser,
  id: number
): AuthTransition {
  const createdAt = new Date(user.created_at).getTime();
  const lastSignInAt = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).getTime()
    : createdAt;
  const type: AuthTransitionType =
    Number.isFinite(createdAt) &&
    Number.isFinite(lastSignInAt) &&
    Math.abs(createdAt - lastSignInAt) < 5_000
      ? "signup"
      : "signin";
  const method: AuthTransitionMethod =
    user.app_metadata.provider === "google" ? "google" : "email";
  return {
    dedupeKey: `${type}:${user.id}:${user.last_sign_in_at ?? user.created_at}`,
    id,
    method,
    type,
    userId: user.id,
  };
}

export function shouldEmitAuthTransition(
  transition: AuthTransition | null,
  currentUserId: string,
  resolvedForUserId: string | null,
  handledTransitionId: number | null
): transition is AuthTransition {
  return !!(
    transition &&
    transition.userId === currentUserId &&
    resolvedForUserId === currentUserId &&
    handledTransitionId !== transition.id
  );
}

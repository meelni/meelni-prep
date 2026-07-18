const fixtureUser = {
  id: "browser-qa-user",
  email: "candidate@example.test",
  created_at: "2026-07-18T00:00:00.000Z",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Synthetic Candidate" },
};

const fixtureSession = {
  expires_at: 1_900_000_000,
  user: fixtureUser,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return children;
}

export function useAuth() {
  const signedOut =
    new URLSearchParams(window.location.search).get("scenario") === "explore";

  return {
    user: signedOut ? null : fixtureUser,
    session: signedOut ? null : fixtureSession,
    isLoading: false,
    signInWithGoogle: async () => undefined,
    signInWithEmail: async () => undefined,
    signUpWithEmail: async () => undefined,
    resetPassword: async () => undefined,
    signOut: async () => undefined,
  };
}

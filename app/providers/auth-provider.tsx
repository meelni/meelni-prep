"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSafeInternalRedirect } from "@/lib/auth/safe-redirect";
import {
  createAuthTransition,
  type AuthTransition,
} from "@/lib/analytics/auth-transition";
import { analytics } from "@/lib/analytics/analytics-service";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  authTransition: AuthTransition | null;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    redirectTo?: string
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authTransition, setAuthTransition] = useState<AuthTransition | null>(
    null
  );
  const authTransitionSequenceRef = useRef(0);
  const lastAuthTransitionKeyRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Error fetching session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const deferExplicitSignOut =
        event === "SIGNED_OUT" && explicitSignOutRef.current;
      if (!deferExplicitSignOut) {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setIsLoading(false);

      if (event === "SIGNED_IN" && session?.user) {
        const transition = createAuthTransition(
          session.user,
          ++authTransitionSequenceRef.current
        );
        if (transition.dedupeKey !== lastAuthTransitionKeyRef.current) {
          lastAuthTransitionKeyRef.current = transition.dedupeKey;
          setAuthTransition(transition);
        }
        // Sync subscription status from Stripe on login
        // This ensures UI reflects current subscription state
        // (prevents issues where webhook failed or was delayed)
        fetch("/api/billing/sync", { method: "POST" })
          .then((res) => res.json())
          .then((data) => {
            if (data.synced) {
              console.log("Subscription synced:", data.message);
            }
          })
          .catch((err) => {
            console.error("Failed to sync subscription:", err);
            // Non-blocking - don't fail login if sync fails
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signInWithGoogle = async (redirectTo?: string) => {
    // Store redirect destination in session storage before OAuth redirect
    if (redirectTo) {
      sessionStorage.setItem(
        "auth_redirect_to",
        getSafeInternalRedirect(redirectTo) ?? "/dashboard"
      );
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Error signing in with email:", error);
      throw error;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    redirectTo?: string
  ) => {
    const safeRedirectTo = getSafeInternalRedirect(redirectTo) ?? "/dashboard";
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", safeRedirectTo);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      console.error("Error signing up with email:", error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      console.error("Error resetting password:", error);
      throw error;
    }
  };

  const signOut = async () => {
    explicitSignOutRef.current = true;
    let error: Error | null = null;
    try {
      const result = await supabase.auth.signOut();
      error = result.error;
    } catch (caught) {
      explicitSignOutRef.current = false;
      throw caught;
    }
    if (error) {
      explicitSignOutRef.current = false;
      console.error("Error signing out:", error);
      throw error;
    }

    analytics.track("auth_signout_completed", {});
    setUser(null);
    setSession(null);
    setAuthTransition(null);
    explicitSignOutRef.current = false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        authTransition,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

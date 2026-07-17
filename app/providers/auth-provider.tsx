"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { analytics } from "@/lib/analytics/analytics-service";
import { scrubRetiredTranscriptBrowserStorage } from "@/lib/privacy/transcript-browser-storage";
import {
  buildAuthCallbackHref,
  buildPasswordResetCallbackHref,
  type AuthHandoffContext,
} from "@/lib/auth/auth-handoff";
import { resolveAuthInitializationWithin } from "@/lib/auth/auth-initialization";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithGoogle: (handoff?: Partial<AuthHandoffContext>) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    handoff?: Partial<AuthHandoffContext>
  ) => Promise<void>;
  resetPassword: (
    email: string,
    handoff?: Partial<AuthHandoffContext>
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // A browser auth client owns subscriptions and in-flight session recovery.
  // Keep one instance for this provider lifetime so state-driven renders do
  // not restart initialization or duplicate auth listeners.
  const [supabase] = useState(createClient);

  useEffect(() => {
    scrubRetiredTranscriptBrowserStorage();
    let active = true;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };
    // Get initial session
    const getInitialSession = async () => {
      const sessionRequest = supabase.auth.getSession();
      try {
        const result = await resolveAuthInitializationWithin(sessionRequest);
        if (result.status === "ready") {
          applySession(result.value.data.session);
        } else {
          console.error("[auth] initial session check timed out");
          void sessionRequest.then(
            ({ data }) => applySession(data.session),
            () => console.error("[auth] delayed session check failed")
          );
        }
      } catch (error) {
        console.error("Error fetching session:", error);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Track auth events
      if (event === "SIGNED_IN" && session?.user) {
        const provider = session.user.app_metadata.provider;
        const method = provider === "google" ? "google" : "email";

        // Check if new user (created_at === last_sign_in_at within 5 seconds)
        const createdAt = new Date(session.user.created_at).getTime();
        const lastSignIn = session.user.last_sign_in_at
          ? new Date(session.user.last_sign_in_at).getTime()
          : createdAt;
        const isNewUser = Math.abs(createdAt - lastSignIn) < 5000;

        if (isNewUser) {
          analytics.track("auth_signup_completed", {
            method,
          });
        } else {
          analytics.track("auth_signin_completed", {
            method,
          });
        }
      } else if (event === "SIGNED_OUT") {
        scrubRetiredTranscriptBrowserStorage();
        analytics.track("auth_signout_completed", {});
        analytics.reset();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithGoogle = async (handoff?: Partial<AuthHandoffContext>) => {
    const callbackHref = buildAuthCallbackHref(handoff ?? {});
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL(callbackHref, window.location.origin).toString(),
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
    handoff?: Partial<AuthHandoffContext>
  ) => {
    const callbackUrl = new URL(
      buildAuthCallbackHref(handoff ?? {}),
      window.location.origin
    );

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

  const resetPassword = async (
    email: string,
    handoff?: Partial<AuthHandoffContext>
  ) => {
    const resetHref = buildPasswordResetCallbackHref(handoff ?? {});
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL(resetHref, window.location.origin).toString(),
    });

    if (error) {
      console.error("Error resetting password:", error);
      throw error;
    }
  };

  const signOut = async () => {
    scrubRetiredTranscriptBrowserStorage();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
      throw error;
    }

    // Track sign out and reset analytics
    analytics.track("auth_signout_completed", {});
    analytics.reset();

    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
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

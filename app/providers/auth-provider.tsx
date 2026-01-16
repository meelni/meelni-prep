"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { analytics } from "@/lib/analytics/analytics-service";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);

        // Identify user if session exists
        if (session?.user) {
          const provider = session.user.app_metadata.provider;
          analytics.identify(session.user.id, {
            email_domain: session.user.email?.split('@')[1],
            signup_method: provider === 'google' ? 'google' : 'email',
            created_at: session.user.created_at,
          });
        }
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
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Track auth events
      if (event === 'SIGNED_IN' && session?.user) {
        const provider = session.user.app_metadata.provider;
        const method = provider === 'google' ? 'google' : 'email';

        // Identify user
        analytics.identify(session.user.id, {
          email_domain: session.user.email?.split('@')[1],
          signup_method: method,
          created_at: session.user.created_at,
        });

        // Check if new user (created_at === last_sign_in_at within 5 seconds)
        const createdAt = new Date(session.user.created_at).getTime();
        const lastSignIn = session.user.last_sign_in_at
          ? new Date(session.user.last_sign_in_at).getTime()
          : createdAt;
        const isNewUser = Math.abs(createdAt - lastSignIn) < 5000;

        if (isNewUser) {
          analytics.track('auth_signup_completed', {
            method,
          });
        } else {
          analytics.track('auth_signin_completed', {
            method,
          });
        }

        // Sync subscription status from Stripe on login
        // This ensures UI reflects current subscription state
        // (prevents issues where webhook failed or was delayed)
        fetch('/api/billing/sync', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.synced) {
              console.log('Subscription synced:', data.message);
            }
          })
          .catch(err => {
            console.error('Failed to sync subscription:', err);
            // Non-blocking - don't fail login if sync fails
          });
      } else if (event === 'SIGNED_OUT') {
        analytics.track('auth_signout_completed', {});
        analytics.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signInWithGoogle = async (redirectTo?: string) => {
    // Store redirect destination in session storage before OAuth redirect
    if (redirectTo) {
      sessionStorage.setItem("auth_redirect_to", redirectTo);
    }

    const { error} = await supabase.auth.signInWithOAuth({
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

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
      throw error;
    }

    // Track sign out and reset analytics
    analytics.track('auth_signout_completed', {});
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

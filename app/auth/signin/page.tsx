"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/app/providers/auth-provider";
import {
  AuthCard,
  AuthDivider,
  AuthInitializationStatus,
  AuthMessage,
  AuthShell,
  GoogleAuthButton,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  AUTH_SIGNUP_PATH,
  AUTH_FORGOT_PASSWORD_PATH,
  buildAuthPageHref,
  getAuthFailureMessage,
  parseAuthHandoffContext,
} from "@/lib/auth/auth-handoff";

function SignInContent() {
  const {
    signInWithGoogle,
    signInWithEmail,
    user,
    isLoading: authLoading,
  } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(() =>
    getAuthFailureMessage(searchParams)
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const authHandoff = parseAuthHandoffContext(searchParams);
  const { redirectTo, cancelTo } = authHandoff;

  useEffect(() => {
    analytics.track("auth_signin_started", {
      source: searchParams?.get("source") || "direct",
    });
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTo);
    }
  }, [user, authLoading, router, redirectTo]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      await signInWithGoogle(authHandoff);
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in. Please try again.");
      setIsSigningIn(false);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);
    setError(null);

    try {
      await signInWithEmail(email, password);
      router.push(redirectTo);
    } catch (err) {
      console.error("Sign in error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to sign in. Please check your credentials.";
      setError(errorMessage);
      setIsSigningIn(false);

      analytics.track("auth_signin_failed", {
        method: "email",
        error_code: "credentials_rejected",
      });
    }
  };

  if (authLoading || user) {
    return <AuthInitializationStatus />;
  }

  return (
    <AuthShell backLabel="Back" onBack={() => router.push(cancelTo)}>
      <AuthCard
        title="Welcome to Meelni"
        description="Save your progress and track improvement over time"
      >
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2 block">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              className="h-12 rounded-lg px-4"
              required
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Button
                type="button"
                variant="link"
                onClick={() =>
                  router.push(
                    buildAuthPageHref(AUTH_FORGOT_PASSWORD_PATH, authHandoff)
                  )
                }
                className="h-auto p-0 text-xs"
              >
                Forgot password?
              </Button>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="h-12 rounded-lg px-4"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isSigningIn}
            className="h-auto w-full rounded-xl px-6 py-3 font-semibold"
          >
            {isSigningIn ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                <span>Signing in...</span>
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <AuthDivider />

        <GoogleAuthButton
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          isLoading={isSigningIn}
          label="Continue with Google"
          loadingLabel="Signing in..."
        />

        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <div className="text-muted-foreground mt-6 text-center text-sm">
          Don&apos;t have an account?{" "}
          <Button
            type="button"
            variant="link"
            onClick={() =>
              router.push(buildAuthPageHref(AUTH_SIGNUP_PATH, authHandoff))
            }
            className="h-auto p-0 font-medium"
          >
            Sign up
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthInitializationStatus />}>
      <SignInContent />
    </Suspense>
  );
}

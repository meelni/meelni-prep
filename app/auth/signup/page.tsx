"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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
  AUTH_SIGNIN_PATH,
  buildAuthPageHref,
  parseAuthHandoffContext,
} from "@/lib/auth/auth-handoff";

type SignUpInputName = "password" | "confirmPassword";

function SignUpContent() {
  const {
    signUpWithEmail,
    signInWithGoogle,
    user,
    isLoading: authLoading,
  } = useAuth();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"email" | "google" | null>(
    null
  );
  const [invalidInputs, setInvalidInputs] = useState<SignUpInputName[]>([]);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const authHandoff = parseAuthHandoffContext(searchParams);
  const { redirectTo, cancelTo } = authHandoff;

  useEffect(() => {
    analytics.track("auth_signup_started", {
      source: searchParams?.get("source") || "direct",
    });
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTo);
    }
  }, [user, authLoading, router, redirectTo]);

  const handleGoogleSignIn = async () => {
    setIsSigningUp(true);
    setError(null);
    setErrorSource(null);
    setInvalidInputs([]);

    try {
      await signInWithGoogle(authHandoff);
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in. Please try again.");
      setErrorSource("google");
      setIsSigningUp(false);
    }
  };

  const handleEmailSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningUp(true);
    setError(null);
    setErrorSource(null);
    setInvalidInputs([]);
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setErrorSource("email");
      setInvalidInputs(["password", "confirmPassword"]);
      setIsSigningUp(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setErrorSource("email");
      setInvalidInputs(["password"]);
      setIsSigningUp(false);
      return;
    }

    try {
      await signUpWithEmail(email, password, authHandoff);
      setSuccess(true);
      setIsSigningUp(false);
    } catch (err) {
      console.error("Sign up error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to sign up. Please try again.";
      setError(errorMessage);
      setErrorSource("email");
      setIsSigningUp(false);

      analytics.track("auth_signup_failed", {
        method: "email",
        error: errorMessage,
      });
    }
  };

  if (authLoading || user) {
    return <AuthInitializationStatus />;
  }

  return (
    <AuthShell backLabel="Back" onBack={() => router.push(cancelTo)}>
      <AuthCard
        title="Create your account"
        description="Start practicing for your PM interviews"
      >
        {success ? (
          <div className="space-y-4">
            <AuthMessage tone="success" title="Check your email!">
              We&apos;ve sent you a confirmation link. Please check your email
              to verify your account.
            </AuthMessage>
            <Button
              type="button"
              onClick={() =>
                router.push(buildAuthPageHref(AUTH_SIGNIN_PATH, authHandoff))
              }
              className="h-auto w-full rounded-xl px-6 py-3 font-semibold"
            >
              Go to Sign In
            </Button>
          </div>
        ) : (
          <>
            <form
              onSubmit={handleEmailSignUp}
              aria-describedby={
                errorSource === "email" ? "signup-email-error" : undefined
              }
              className="space-y-4"
            >
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
                <Label htmlFor="password" className="mb-2 block">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  aria-invalid={invalidInputs.includes("password") || undefined}
                  aria-describedby={
                    invalidInputs.includes("password")
                      ? "signup-email-error"
                      : undefined
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password (min. 8 characters)"
                  className="h-12 rounded-lg px-4"
                  required
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="mb-2 block">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  aria-invalid={
                    invalidInputs.includes("confirmPassword") || undefined
                  }
                  aria-describedby={
                    invalidInputs.includes("confirmPassword")
                      ? "signup-email-error"
                      : undefined
                  }
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm your password"
                  className="h-12 rounded-lg px-4"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSigningUp}
                className="h-auto w-full rounded-xl px-6 py-3 font-semibold"
              >
                {isSigningUp ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2
                      className="h-5 w-5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span>Creating account...</span>
                  </span>
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>

            {error && errorSource === "email" && (
              <AuthMessage id="signup-email-error" tone="error">
                {error}
              </AuthMessage>
            )}

            <AuthDivider />

            <GoogleAuthButton
              onClick={handleGoogleSignIn}
              disabled={isSigningUp}
              isLoading={isSigningUp}
              label="Continue with Google"
              loadingLabel="Signing up..."
              ariaDescribedBy={
                errorSource === "google" ? "signup-google-error" : undefined
              }
            />

            {error && errorSource === "google" && (
              <AuthMessage id="signup-google-error" tone="error">
                {error}
              </AuthMessage>
            )}

            <p className="text-muted-foreground mt-5 text-center text-xs leading-5">
              Review the{" "}
              <Link
                href="/terms"
                className="text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              >
                Terms draft
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              >
                Privacy draft
              </Link>{" "}
              before creating an account.
            </p>

            <div className="text-muted-foreground mt-6 text-center text-sm">
              Already have an account?{" "}
              <Button
                type="button"
                variant="link"
                onClick={() =>
                  router.push(buildAuthPageHref(AUTH_SIGNIN_PATH, authHandoff))
                }
                className="min-h-11 px-2 py-0 font-medium"
              >
                Sign in
              </Button>
            </div>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthInitializationStatus />}>
      <SignUpContent />
    </Suspense>
  );
}

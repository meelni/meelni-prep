"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/app/providers/auth-provider";
import {
  AuthCard,
  AuthInitializationStatus,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTH_SIGNIN_PATH,
  buildAuthPageHref,
  parseAuthHandoffContext,
} from "@/lib/auth/auth-handoff";

function ForgotPasswordContent() {
  const { resetPassword } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const authHandoff = parseAuthHandoffContext(searchParams);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await resetPassword(email, authHandoff);
      setSuccess(true);
      setIsSubmitting(false);
    } catch (err) {
      console.error("Password reset error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send reset email. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      backLabel="Back"
      onBack={() => router.push(authHandoff.cancelTo)}
    >
      <AuthCard
        icon="key"
        title="Reset your password"
        description="Enter your email and we'll send you a reset link"
      >
        {success ? (
          <div className="space-y-4">
            <AuthMessage tone="success" title="Check your email!">
              We&apos;ve sent you a password reset link. Please check your
              email.
            </AuthMessage>
            <Button
              type="button"
              onClick={() =>
                router.push(buildAuthPageHref(AUTH_SIGNIN_PATH, authHandoff))
              }
              className="h-auto w-full rounded-xl px-6 py-3 font-semibold"
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <>
            <form onSubmit={handleResetPassword} className="space-y-4">
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

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-auto w-full rounded-xl px-6 py-3 font-semibold"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2
                      className="h-5 w-5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span>Sending reset link...</span>
                  </span>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>

            {error && <AuthMessage tone="error">{error}</AuthMessage>}

            <div className="text-muted-foreground mt-6 text-center text-sm">
              Remember your password?{" "}
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

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthInitializationStatus />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

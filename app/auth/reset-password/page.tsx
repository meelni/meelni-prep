"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthCard, AuthMessage, AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setIsSubmitting(false);

      setTimeout(() => {
        router.push("/auth/signin");
      }, 2000);
    } catch (err) {
      console.error("Password update error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update password. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell backLabel="Back to home" onBack={() => router.push("/")}>
      <AuthCard
        icon="key"
        title="Set new password"
        description="Choose a strong password for your account"
      >
        {success ? (
          <AuthMessage tone="success" title="Password updated!">
            Your password has been updated successfully. Redirecting to sign in.
          </AuthMessage>
        ) : (
          <>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <Label htmlFor="password" className="mb-2 block">
                  New Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter new password (min. 8 characters)"
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
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm your new password"
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
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Updating password...</span>
                  </span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>

            {error && <AuthMessage tone="error">{error}</AuthMessage>}
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}

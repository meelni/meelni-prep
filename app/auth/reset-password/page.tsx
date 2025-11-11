"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setIsSubmitting(false);

      // Redirect to sign in after 2 seconds
      setTimeout(() => {
        router.push("/auth/signin");
      }, 2000);
    } catch (err: any) {
      console.error("Password update error:", err);
      setError(err.message || "Failed to update password. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo/Brand */}
          <div className="mb-8 text-center">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80"
            >
              <svg
                className="h-8 w-8 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a strong password for your account
            </p>
          </div>

          {success ? (
            /* Success Message */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600">
                <p className="font-medium">Password updated!</p>
                <p className="mt-1 text-green-600/80">
                  Your password has been updated successfully. Redirecting to sign in...
                </p>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Update Password Form */}
              <motion.form
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                onSubmit={handleUpdatePassword}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Updating password...</span>
                    </div>
                  ) : (
                    "Update Password"
                  )}
                </button>
              </motion.form>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500"
                >
                  {error}
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Back to Home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center"
        >
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to home
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

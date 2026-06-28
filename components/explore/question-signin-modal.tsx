"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";

interface QuestionSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionText: string;
  questionId: string;
}

export function QuestionSignInModal({
  isOpen,
  onClose,
  questionText,
  questionId,
}: QuestionSignInModalProps) {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleGoogleSignIn = async () => {
    // Redirect to dashboard after Google OAuth
    await signInWithGoogle("/dashboard");
  };

  const handleEmailSignIn = () => {
    // Redirect to sign-in page
    router.push("/auth/signin");
  };

  const handleSignUp = () => {
    // Redirect to sign-up page
    router.push("/auth/signup");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          >
            {/* Modal Card */}
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-background/95 backdrop-blur-xl p-8 shadow-2xl">
              {/* Close Button */}
              <Button
                type="button"
                variant="quiet"
                size="icon"
                onClick={onClose}
                className="absolute top-4 right-4 h-8 w-8"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </Button>

              {/* Heading */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold text-foreground">
                  Ready to practice?
                </h2>
              </div>

              {/* Selected Question (Highlighted box) */}
              <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
                <p className="text-base font-semibold text-foreground leading-relaxed line-clamp-2">
                  "{questionText}"
                </p>
              </div>

              {/* Google Sign In */}
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleGoogleSignIn}
                className="mb-4 h-14 w-full rounded-xl border-2 font-semibold"
              >
                <div className="flex items-center justify-center gap-3">
                  <Icons.google className="w-5 h-5" />
                  <span>Continue with Google</span>
                </div>
              </Button>

              {/* Email Sign In */}
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleEmailSignIn}
                className="h-14 w-full rounded-xl border-2 font-semibold"
              >
                Continue with Email
              </Button>

              {/* Footer */}
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={handleSignUp}
                  className="h-auto p-0 font-medium"
                >
                  Sign up free
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

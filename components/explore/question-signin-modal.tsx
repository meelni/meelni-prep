"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icons } from "@/components/icons";

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

  const handleGoogleSignIn = () => {
    // Store the question ID in session storage to redirect after auth
    sessionStorage.setItem("pendingQuestionId", questionId);
    router.push(`/auth/signin?provider=google&redirectTo=/setup?questionId=${questionId}`);
  };

  const handleEmailSignIn = () => {
    sessionStorage.setItem("pendingQuestionId", questionId);
    router.push(`/auth/signin?redirectTo=/setup?questionId=${questionId}`);
  };

  const handleSignUp = () => {
    sessionStorage.setItem("pendingQuestionId", questionId);
    router.push(`/auth/signup?redirectTo=/setup?questionId=${questionId}`);
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
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>

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
              <button
                onClick={handleGoogleSignIn}
                className="w-full px-6 py-4 rounded-xl border-2 border-border bg-background hover:border-primary/50 hover:bg-background/80 font-semibold transition-all duration-300 mb-4"
              >
                <div className="flex items-center justify-center gap-3">
                  <Icons.google className="w-5 h-5" />
                  <span>Continue with Google</span>
                </div>
              </button>

              {/* Email Sign In */}
              <button
                onClick={handleEmailSignIn}
                className="w-full px-6 py-4 rounded-xl border-2 border-border bg-background hover:border-primary/50 hover:bg-background/80 font-semibold transition-all duration-300"
              >
                Continue with Email
              </button>

              {/* Footer */}
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button
                  onClick={handleSignUp}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Sign up free
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

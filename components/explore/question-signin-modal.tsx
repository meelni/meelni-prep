"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { buildQuestionInterviewHref } from "@/lib/navigation/interview-launch";

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
  const interviewDestination = buildQuestionInterviewHref(questionId);

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
    await signInWithGoogle(interviewDestination);
  };

  const handleEmailSignIn = () => {
    router.push(
      `/auth/signin?redirectTo=${encodeURIComponent(interviewDestination)}`
    );
  };

  const handleSignUp = () => {
    router.push(
      `/auth/signup?redirectTo=${encodeURIComponent(interviewDestination)}`
    );
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
            className="bg-overlay/80 fixed inset-0 z-[9999] backdrop-blur-sm"
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
            <div className="border-border bg-background/95 relative w-full max-w-md rounded-2xl border p-8 shadow-2xl backdrop-blur-xl">
              {/* Close Button */}
              <Button
                type="button"
                variant="quiet"
                size="icon"
                onClick={onClose}
                className="absolute top-4 right-4 h-8 w-8"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </Button>

              {/* Heading */}
              <div className="mb-6 text-center">
                <h2 className="text-foreground text-2xl font-semibold">
                  Ready to practice?
                </h2>
              </div>

              {/* Selected Question (Highlighted box) */}
              <div className="from-primary/5 to-primary/10 border-primary/20 mb-8 rounded-xl border bg-gradient-to-br p-6">
                <p className="text-foreground line-clamp-2 text-base leading-relaxed font-semibold">
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
                  <Icons.google className="h-5 w-5" />
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
              <div className="text-muted-foreground mt-6 text-center text-sm">
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

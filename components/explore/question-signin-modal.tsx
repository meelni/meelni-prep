"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { AuthMessage } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/app/providers/auth-provider";
import {
  AUTH_SIGNIN_PATH,
  AUTH_SIGNUP_PATH,
  buildAuthPageHref,
} from "@/lib/auth/auth-handoff";
import { buildInternalRequestDestination } from "@/lib/auth/safe-redirect";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { signInWithGoogle } = useAuth();
  const [isStartingGoogle, setIsStartingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const originDestination = buildInternalRequestDestination(
    pathname,
    searchParams.toString()
  );
  const interviewDestination = buildQuestionInterviewHref(
    questionId,
    originDestination
  );
  const authHandoff = {
    redirectTo: interviewDestination,
    cancelTo: originDestination,
  };

  useEffect(() => {
    if (!isOpen) {
      setIsStartingGoogle(false);
      setGoogleError(null);
    }
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    setIsStartingGoogle(true);
    setGoogleError(null);
    try {
      await signInWithGoogle(authHandoff);
    } catch (error) {
      console.error("Google sign-in initiation failed:", error);
      setGoogleError("Google sign-in could not start. Please try again.");
      setIsStartingGoogle(false);
    }
  };

  const handleEmailSignIn = () => {
    router.push(buildAuthPageHref(AUTH_SIGNIN_PATH, authHandoff));
  };

  const handleSignUp = () => {
    router.push(buildAuthPageHref(AUTH_SIGNUP_PATH, authHandoff));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-background/95 max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-2xl p-6 shadow-2xl sm:p-8">
        <DialogHeader className="mb-2 text-center sm:text-center">
          <DialogTitle className="text-foreground text-2xl font-semibold">
            Ready to practice?
          </DialogTitle>
          <DialogDescription>
            Sign in to practice the selected interview question.
          </DialogDescription>
        </DialogHeader>

        <div className="from-primary/5 to-primary/10 border-primary/20 rounded-xl border bg-gradient-to-br p-5 sm:p-6">
          <p className="text-foreground line-clamp-2 text-base leading-relaxed font-semibold">
            &ldquo;{questionText}&rdquo;
          </p>
        </div>

        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={isStartingGoogle}
            aria-busy={isStartingGoogle}
            className="h-14 w-full rounded-xl border-2 font-semibold"
          >
            <span className="flex items-center justify-center gap-3">
              {isStartingGoogle ? (
                <Loader2
                  className="h-5 w-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Icons.google className="h-5 w-5" />
              )}
              <span>
                {isStartingGoogle
                  ? "Opening Google..."
                  : "Continue with Google"}
              </span>
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleEmailSignIn}
            disabled={isStartingGoogle}
            className="h-14 w-full rounded-xl border-2 font-semibold"
          >
            Continue with Email
          </Button>
        </div>

        {googleError && <AuthMessage tone="error">{googleError}</AuthMessage>}

        <div className="text-muted-foreground text-center text-sm">
          Don&apos;t have an account?{" "}
          <Button
            type="button"
            variant="link"
            onClick={handleSignUp}
            disabled={isStartingGoogle}
            className="h-auto p-0 font-medium"
          >
            Sign up free
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type RefObject, useEffect, useState } from "react";
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
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function QuestionSignInModal({
  isOpen,
  onClose,
  questionText,
  questionId,
  returnFocusRef,
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-overlay/80"
        closeClassName="flex h-11 w-11 items-center justify-center"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
        className="bg-background/95 max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl p-5 shadow-2xl sm:p-8"
      >
        <DialogHeader className="pr-12 text-left">
          <DialogTitle className="text-2xl">Ready to practice?</DialogTitle>
          <DialogDescription>
            Sign in to practice the selected interview question.
          </DialogDescription>
        </DialogHeader>

        <div className="border-primary/20 bg-primary/5 max-h-32 overflow-y-auto rounded-xl border p-4 sm:p-6">
          <p className="text-foreground text-sm leading-relaxed font-semibold [overflow-wrap:anywhere] break-words sm:text-base">
            &ldquo;{questionText}&rdquo;
          </p>
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={isStartingGoogle}
            aria-busy={isStartingGoogle}
            className="min-h-12 w-full rounded-xl border-2 font-semibold whitespace-normal"
          >
            <span className="flex items-center justify-center gap-3">
              {isStartingGoogle ? (
                <Loader2
                  className="h-5 w-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Icons.google className="h-5 w-5" aria-hidden="true" />
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
            className="min-h-12 w-full rounded-xl border-2 font-semibold whitespace-normal"
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
            className="h-auto min-h-11 p-0 font-medium whitespace-normal"
          >
            Sign up free
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

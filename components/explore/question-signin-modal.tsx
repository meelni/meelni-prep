"use client";

import { useRouter } from "next/navigation";
import type { RefObject } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/app/providers/auth-provider";
import { buildQuestionInterviewHref } from "@/lib/navigation/interview-launch";

interface QuestionSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionText: string;
  questionId: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function QuestionSignInModal({
  isOpen,
  onClose,
  questionText,
  questionId,
  returnFocusRef,
}: QuestionSignInModalProps) {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();
  const interviewDestination = buildQuestionInterviewHref(questionId);

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
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto p-5 sm:p-8"
      >
        <DialogHeader className="pr-12 text-left">
          <DialogTitle className="text-2xl">Ready to practice?</DialogTitle>
          <DialogDescription>
            Continue to start a mock interview with this question selected.
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
            className="min-h-12 w-full gap-3 rounded-xl border-2 font-semibold whitespace-normal"
          >
            <Icons.google className="h-5 w-5 shrink-0" />
            <span>Continue with Google</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleEmailSignIn}
            className="min-h-12 w-full rounded-xl border-2 font-semibold whitespace-normal"
          >
            Continue with Email
          </Button>
        </div>

        <div className="text-muted-foreground text-center text-sm">
          Don&apos;t have an account?{" "}
          <Button
            type="button"
            variant="link"
            onClick={handleSignUp}
            className="h-auto min-h-11 p-0 font-medium whitespace-normal"
          >
            Sign up free
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

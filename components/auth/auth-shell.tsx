"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { KeyRound, Loader2, Mic } from "lucide-react";

import { AppSurface } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { GOOGLE_LOGO_COLORS } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: React.ReactNode;
  backLabel?: string;
  onBack?: () => void;
}

function AuthInitializationStatus({
  message = "Checking your sign-in status",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <Loader2
        className="text-primary h-8 w-8 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function AuthShell({ children, backLabel, onBack }: AuthShellProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
        className="w-full max-w-md"
      >
        {children}
        {backLabel && onBack && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
            className="mt-6 text-center"
          >
            <Button
              type="button"
              variant="link"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground min-h-11 px-3 py-0 text-sm"
            >
              {backLabel}
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

interface AuthCardProps {
  children: React.ReactNode;
  icon?: "mic" | "key";
  title: string;
  description: string;
}

function AuthCard({
  children,
  icon = "mic",
  title,
  description,
}: AuthCardProps) {
  const Icon = icon === "key" ? KeyRound : Mic;
  const shouldReduceMotion = useReducedMotion();

  return (
    <AppSurface
      variant="default"
      size="lg"
      className="bg-background/80 rounded-2xl p-6 shadow-2xl backdrop-blur-xl sm:p-8"
    >
      <div className="mb-8 text-center">
        <motion.div
          initial={shouldReduceMotion ? false : { scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.5,
            delay: shouldReduceMotion ? 0 : 0.1,
          }}
          className="from-primary to-primary/80 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br"
        >
          <Icon
            className="text-primary-foreground h-8 w-8"
            aria-hidden="true"
          />
        </motion.div>
        <h1 className="text-foreground text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </div>
      {children}
    </AppSurface>
  );
}

function AuthDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="border-border w-full border-t" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-background text-muted-foreground px-4">
          Or continue with
        </span>
      </div>
    </div>
  );
}

interface AuthMessageProps {
  children: React.ReactNode;
  id?: string;
  title?: string;
  tone: "success" | "error";
}

function AuthMessage({ children, id, title, tone }: AuthMessageProps) {
  const isSuccess = tone === "success";
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      id={id}
      role={isSuccess ? "status" : "alert"}
      aria-live={isSuccess ? "polite" : "assertive"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : undefined }}
      className={cn(
        "mt-4 rounded-lg border px-4 py-3 text-sm",
        isSuccess
          ? "border-success/20 bg-success/10 text-success"
          : "border-destructive/20 bg-destructive/10 text-destructive"
      )}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className={cn(title && "mt-1 opacity-80")}>{children}</div>
    </motion.div>
  );
}

interface GoogleAuthButtonProps {
  ariaDescribedBy?: string;
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  loadingLabel: string;
  onClick: () => void;
}

function GoogleAuthButton({
  ariaDescribedBy,
  disabled,
  isLoading,
  label,
  loadingLabel,
  onClick,
}: GoogleAuthButtonProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
    >
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={disabled}
        aria-busy={isLoading || undefined}
        aria-describedby={ariaDescribedBy}
        className="hover:border-primary/50 bg-background hover:bg-background/80 h-auto w-full overflow-hidden rounded-xl border-2 px-6 py-4 font-semibold"
      >
        <span className="relative z-10 flex items-center justify-center gap-3">
          {isLoading ? (
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill={GOOGLE_LOGO_COLORS.blue}
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill={GOOGLE_LOGO_COLORS.green}
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill={GOOGLE_LOGO_COLORS.yellow}
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill={GOOGLE_LOGO_COLORS.red}
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span>{isLoading ? loadingLabel : label}</span>
        </span>
      </Button>
    </motion.div>
  );
}

export {
  AuthShell,
  AuthCard,
  AuthDivider,
  AuthMessage,
  AuthInitializationStatus,
  GoogleAuthButton,
};

"use client";

import type { MouseEventHandler, ReactNode } from "react";
import Link from "next/link";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  PUBLIC_ACTIVATION_PAUSED_DESCRIPTION,
  PUBLIC_ACTIVATION_PAUSED_LABEL,
} from "@/lib/feature-flags/public-activation";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";

interface PublicActivationButtonProps extends Omit<
  ButtonProps,
  "asChild" | "children" | "disabled" | "onClick" | "type"
> {
  children: ReactNode;
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  pausedLabel?: string;
}

export function PublicActivationButton({
  children,
  href,
  onClick,
  pausedLabel = PUBLIC_ACTIVATION_PAUSED_LABEL,
  ...buttonProps
}: PublicActivationButtonProps) {
  const decision = usePublicActivationDecision();

  if (!decision.canActivate) {
    return (
      <Button
        {...buttonProps}
        type="button"
        disabled
        aria-label={pausedLabel}
        title={PUBLIC_ACTIVATION_PAUSED_DESCRIPTION}
      >
        {pausedLabel}
      </Button>
    );
  }

  return (
    <Button {...buttonProps} asChild>
      <Link href={href} onClick={onClick}>
        {children}
      </Link>
    </Button>
  );
}

interface PublicActivationInlineLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
  pausedLabel?: string;
}

export function PublicActivationInlineLink({
  children,
  className,
  href,
  pausedLabel = PUBLIC_ACTIVATION_PAUSED_LABEL,
}: PublicActivationInlineLinkProps) {
  const decision = usePublicActivationDecision();

  if (!decision.canActivate) {
    return (
      <span
        aria-disabled="true"
        className="text-muted-foreground cursor-not-allowed no-underline"
        title={PUBLIC_ACTIVATION_PAUSED_DESCRIPTION}
      >
        {pausedLabel}
      </span>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

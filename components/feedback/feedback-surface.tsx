import * as React from "react";

import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
} from "@/components/ui/app-surface";
import { cn } from "@/lib/utils";

type FeedbackTone = "default" | "success" | "warning" | "info" | "danger";

const toneClasses: Record<FeedbackTone, string> = {
  default: "",
  success: "border-emerald-500/20 bg-emerald-500/5 dark:border-emerald-500/25",
  warning: "border-amber-500/20 bg-amber-500/5 dark:border-amber-500/25",
  info: "border-blue-500/20 bg-blue-500/5 dark:border-blue-500/25",
  danger: "border-red-500/20 bg-red-500/5 dark:border-red-500/25",
};

const iconToneClasses: Record<FeedbackTone, string> = {
  default: "text-primary",
  success: "text-emerald-500",
  warning: "text-amber-500",
  info: "text-blue-500",
  danger: "text-red-500",
};

const toneIndicatorClasses: Record<FeedbackTone, string> = {
  default: "border-primary/10 bg-primary/5 text-primary",
  success: "border-emerald-500/10 bg-emerald-500/5 text-emerald-500",
  warning: "border-amber-500/10 bg-amber-500/5 text-amber-500",
  info: "border-blue-500/10 bg-blue-500/5 text-blue-500",
  danger: "border-red-500/10 bg-red-500/5 text-red-500",
};

const statusPageBackgroundClasses: Record<FeedbackTone, string> = {
  default: "to-primary/5",
  success: "to-emerald-500/5",
  warning: "to-amber-500/5",
  info: "to-blue-500/5",
  danger: "to-red-500/5",
};

interface FeedbackSectionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: FeedbackTone;
  contentClassName?: string;
  headerClassName?: string;
}

interface FeedbackStatusPageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  tone?: FeedbackTone;
  actions?: React.ReactNode;
  contentClassName?: string;
}

function FeedbackStatusPage({
  className,
  icon,
  title,
  description,
  tone = "default",
  actions,
  contentClassName,
  children,
  ...props
}: FeedbackStatusPageProps) {
  return (
    <div
      className={cn(
        "from-background via-background min-h-screen bg-gradient-to-br p-4 md:p-8",
        statusPageBackgroundClasses[tone],
        className
      )}
      {...props}
    >
      <div className={cn("mx-auto max-w-3xl space-y-6", contentClassName)}>
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full",
                toneIndicatorClasses[tone]
              )}
            >
              {icon}
            </div>
          </div>
          <h1 className="font-display text-3xl font-light md:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground text-lg">{description}</p>
        </div>
        {children}
        {actions && (
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

interface FeedbackMetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  tone?: FeedbackTone;
}

function FeedbackMetricCard({
  className,
  icon,
  label,
  value,
  helper,
  tone = "default",
  ...props
}: FeedbackMetricCardProps) {
  return (
    <div
      className={cn(
        "border-border/50 bg-background/50 flex items-center gap-3 rounded-lg border p-3",
        className
      )}
      {...props}
    >
      {icon && (
        <div className={cn("shrink-0", iconToneClasses[tone])}>{icon}</div>
      )}
      <div className="min-w-0">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className="text-lg font-medium">
          {value}
          {helper && (
            <span className={cn("ml-2 text-xs", iconToneClasses[tone])}>
              {helper}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeedbackActionItemProps
  extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "title"> {
  icon?: React.ReactNode;
  marker?: React.ReactNode;
  title?: React.ReactNode;
  tone?: FeedbackTone;
}

function FeedbackActionItem({
  className,
  icon,
  marker,
  title,
  tone = "default",
  children,
  ...props
}: FeedbackActionItemProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        toneIndicatorClasses[tone],
        className
      )}
      {...props}
    >
      {marker ? (
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            toneIndicatorClasses[tone]
          )}
        >
          {marker}
        </div>
      ) : (
        icon && <div className="mt-0.5 shrink-0">{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-foreground mb-1 font-medium">{title}</div>
        )}
        <div className="text-muted-foreground text-sm">{children}</div>
      </div>
    </li>
  );
}

function FeedbackSectionCard({
  className,
  title,
  description,
  icon,
  action,
  tone = "default",
  contentClassName,
  headerClassName,
  children,
  ...props
}: FeedbackSectionCardProps) {
  return (
    <AppSurface
      size="none"
      className={cn("overflow-hidden", toneClasses[tone], className)}
      {...props}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 p-6 pb-4",
          headerClassName
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon && (
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center",
                iconToneClasses[tone]
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <AppSurfaceTitle className="text-lg">{title}</AppSurfaceTitle>
            {description && (
              <AppSurfaceDescription>{description}</AppSurfaceDescription>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("px-6 pb-6", contentClassName)}>{children}</div>
    </AppSurface>
  );
}

interface FeedbackScoreCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  score: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
}

function FeedbackScoreCard({
  className,
  score,
  label,
  description,
  children,
  ...props
}: FeedbackScoreCardProps) {
  return (
    <AppSurface
      variant="accent"
      size="lg"
      className={cn("text-center", className)}
      {...props}
    >
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="text-primary text-6xl font-bold">{score}</div>
        <AppSurfaceTitle className="text-lg font-medium">
          {label}
        </AppSurfaceTitle>
        {description && (
          <AppSurfaceDescription className="text-sm">
            {description}
          </AppSurfaceDescription>
        )}
        {children}
      </div>
    </AppSurface>
  );
}

interface FeedbackStateCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

function FeedbackStateCard({
  className,
  icon,
  title,
  description,
  action,
  children,
  ...props
}: FeedbackStateCardProps) {
  return (
    <AppSurface
      variant="muted"
      size="lg"
      className={cn("py-12 text-center", className)}
      {...props}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="space-y-3">
          {icon && (
            <div className="bg-primary/10 text-primary mx-auto flex h-20 w-20 items-center justify-center rounded-full">
              {icon}
            </div>
          )}
          <AppSurfaceTitle className="text-2xl">{title}</AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription className="text-sm">
              {description}
            </AppSurfaceDescription>
          )}
        </div>
        {children}
        {action}
      </div>
    </AppSurface>
  );
}

export {
  FeedbackSectionCard,
  FeedbackScoreCard,
  FeedbackStateCard,
  FeedbackStatusPage,
  FeedbackMetricCard,
  FeedbackActionItem,
};

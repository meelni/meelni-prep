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
  success: "border-success/20 bg-success/5",
  warning: "border-warning/20 bg-warning/5",
  info: "border-info/20 bg-info/5",
  danger: "border-destructive/20 bg-destructive/5",
};

const iconToneClasses: Record<FeedbackTone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  danger: "text-destructive",
};

const toneIndicatorClasses: Record<FeedbackTone, string> = {
  default: "border-primary/10 bg-primary/5 text-primary",
  success: "border-success/10 bg-success/5 text-success",
  warning: "border-warning/10 bg-warning/5 text-warning",
  info: "border-info/10 bg-info/5 text-info",
  danger: "border-destructive/10 bg-destructive/5 text-destructive",
};

const statusPageBackgroundClasses: Record<FeedbackTone, string> = {
  default: "to-primary/5",
  success: "to-success/5",
  warning: "to-warning/5",
  info: "to-info/5",
  danger: "to-destructive/5",
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
  maxWidth?: FeedbackReviewShellProps["maxWidth"];
}

interface FeedbackReviewShellProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  label?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  maxWidth?: "md" | "lg" | "xl";
  bodyClassName?: string;
}

const feedbackReviewShellMaxWidthClasses = {
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-7xl",
};

function FeedbackReviewShell({
  className,
  label = "Interview Feedback",
  title,
  description,
  action,
  maxWidth = "lg",
  bodyClassName,
  children,
  ...props
}: FeedbackReviewShellProps) {
  return (
    <div
      className={cn(
        "bg-background text-foreground flex min-h-screen",
        className
      )}
      {...props}
    >
      <main className="min-w-0 flex-1 p-3">
        <section className="border-border bg-card flex min-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-[10px] border shadow-sm">
          <header className="border-border flex min-h-10 shrink-0 items-center justify-between gap-3 border-b bg-transparent px-4 py-2 sm:px-8">
            <p className="text-muted-foreground truncate text-xs font-bold tracking-[0.24em] uppercase sm:tracking-[0.28em]">
              {label}
            </p>
            {action && <div className="shrink-0">{action}</div>}
          </header>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6",
              bodyClassName
            )}
          >
            <div
              className={cn(
                "mx-auto w-full space-y-8",
                feedbackReviewShellMaxWidthClasses[maxWidth]
              )}
            >
              {(title || description) && (
                <div className="space-y-2">
                  {title && (
                    <h1 className="font-display text-foreground text-3xl font-light tracking-tight sm:text-4xl">
                      {title}
                    </h1>
                  )}
                  {description && (
                    <p className="text-muted-foreground max-w-2xl text-sm leading-6">
                      {description}
                    </p>
                  )}
                </div>
              )}
              {children}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeedbackStatusPage({
  className,
  icon,
  title,
  description,
  tone = "default",
  actions,
  contentClassName,
  maxWidth = "md",
  children,
  ...props
}: FeedbackStatusPageProps) {
  return (
    <FeedbackReviewShell
      className={cn(
        "from-background via-background bg-gradient-to-br",
        statusPageBackgroundClasses[tone],
        className
      )}
      maxWidth={maxWidth}
      bodyClassName="flex items-center"
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
    </FeedbackReviewShell>
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
          "flex items-start justify-between gap-3 p-4 pb-3 sm:gap-4 sm:p-6 sm:pb-4",
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
      <div className={cn("px-4 pb-4 sm:px-6 sm:pb-6", contentClassName)}>
        {children}
      </div>
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
      variant="default"
      size="lg"
      className={cn(
        "border-primary bg-card ring-primary/20 text-center shadow-md ring-1",
        className
      )}
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
  FeedbackReviewShell,
  FeedbackSectionCard,
  FeedbackScoreCard,
  FeedbackStateCard,
  FeedbackStatusPage,
  FeedbackMetricCard,
  FeedbackActionItem,
};

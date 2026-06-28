import * as React from "react";
import type { LucideIcon } from "lucide-react";

import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  appSurfaceVariants,
} from "@/components/ui/app-surface";
import { cn } from "@/lib/utils";

interface DashboardMetricCardProps
  extends React.HTMLAttributes<HTMLElement> {
  icon?: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  indicator?: React.ReactNode;
  valueClassName?: string;
}

function DashboardMetricCard({
  className,
  icon: Icon,
  label,
  value,
  indicator,
  valueClassName,
  onClick,
  ...props
}: DashboardMetricCardProps) {
  const content = (
    <>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="text-primary h-5 w-5 shrink-0" />}
          <span>{label}</span>
        </div>
        {indicator && <div className="shrink-0">{indicator}</div>}
      </div>
      <div className={cn("font-mono text-3xl font-bold text-foreground", valueClassName)}>
        {value}
      </div>
    </>
  );

  const classes = cn(
    appSurfaceVariants({ variant: "default", size: "lg" }),
    "flex min-h-[140px] flex-col justify-between gap-4 text-left transition-colors hover:border-primary/30",
    onClick && "cursor-pointer",
    className
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} {...props}>
        {content}
      </button>
    );
  }

  return (
    <AppSurface className={classes} size="none" {...props}>
      {content}
    </AppSurface>
  );
}

interface DashboardChartCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  contentClassName?: string;
  headerClassName?: string;
  centeredHeader?: boolean;
}

function DashboardChartCard({
  className,
  title,
  description,
  action,
  children,
  contentClassName,
  headerClassName,
  centeredHeader,
  ...props
}: DashboardChartCardProps) {
  return (
    <AppSurface
      size="none"
      className={cn("flex h-full flex-col overflow-hidden", className)}
      {...props}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 p-6 pb-3",
          centeredHeader && "items-center text-center",
          headerClassName
        )}
      >
        <div className={cn("space-y-1", centeredHeader && "mx-auto")}>
          <AppSurfaceTitle className="text-base">{title}</AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription>{description}</AppSurfaceDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("flex-1 p-6 pt-3", contentClassName)}>
        {children}
      </div>
    </AppSurface>
  );
}

interface DashboardStateCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "primary" | "danger";
}

function DashboardStateCard({
  className,
  icon,
  title,
  description,
  action,
  tone = "primary",
  children,
  ...props
}: DashboardStateCardProps) {
  return (
    <AppSurface
      variant={tone === "primary" ? "accent" : "default"}
      size="lg"
      className={cn(
        "text-center",
        tone === "danger" && "border-destructive/20 bg-destructive/5",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        <div className="space-y-3">
          {icon && (
            <div
              className={cn(
                "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
                tone === "danger"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              )}
            >
              {icon}
            </div>
          )}
          <AppSurfaceTitle className="font-display text-3xl font-light">
            {title}
          </AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription className="mx-auto max-w-md text-lg">
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

interface DashboardSkeletonCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "metric" | "chart";
}

function DashboardSkeletonCard({
  className,
  variant = "metric",
  children,
  ...props
}: DashboardSkeletonCardProps) {
  return (
    <AppSurface
      size="lg"
      className={cn(
        variant === "metric" ? "min-h-[140px]" : "min-h-[460px]",
        className
      )}
      {...props}
    >
      {children || (variant === "metric" ? (
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-20 animate-pulse rounded bg-muted" />
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          <div className="h-[360px] animate-pulse rounded bg-muted" />
        </div>
      ))}
    </AppSurface>
  );
}

interface DashboardSectionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  contentClassName?: string;
}

function DashboardSectionCard({
  className,
  title,
  description,
  action,
  contentClassName,
  children,
  ...props
}: DashboardSectionCardProps) {
  return (
    <AppSurface
      size="none"
      className={cn("flex flex-col overflow-hidden", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-4 p-6 pb-3">
        <div className="space-y-1">
          <AppSurfaceTitle className="font-display text-sm font-light uppercase tracking-wider text-muted-foreground">
            {title}
          </AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription>{description}</AppSurfaceDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("flex-1 p-6 pt-0", contentClassName)}>
        {children}
      </div>
    </AppSurface>
  );
}

interface DashboardActionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  action: React.ReactNode;
  variant?: "default" | "accent";
  children?: React.ReactNode;
}

function DashboardActionCard({
  className,
  eyebrow,
  icon,
  title,
  description,
  action,
  variant = "default",
  children,
  ...props
}: DashboardActionCardProps) {
  return (
    <AppSurface
      variant={variant}
      size="lg"
      className={cn(
        "transition-colors hover:border-primary/30",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 space-y-3">
          {(eyebrow || icon) && (
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              {icon}
              {eyebrow && <span>{eyebrow}</span>}
            </div>
          )}
          <AppSurfaceTitle className="font-display text-2xl font-light">
            {title}
          </AppSurfaceTitle>
          <AppSurfaceDescription className="max-w-2xl text-sm">
            {description}
          </AppSurfaceDescription>
          {children}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </AppSurface>
  );
}

export {
  DashboardMetricCard,
  DashboardChartCard,
  DashboardStateCard,
  DashboardSkeletonCard,
  DashboardSectionCard,
  DashboardActionCard,
};

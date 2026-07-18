import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  appSurfaceVariants,
} from "@/components/ui/app-surface";
import { cn } from "@/lib/utils";

interface DashboardSidebarNavItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

const DashboardSidebarNavItem = React.forwardRef<
  HTMLButtonElement,
  DashboardSidebarNavItemProps
>(({ className, selected, type = "button", children, ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-current={selected ? "page" : undefined}
    className={cn(
      "border-dashboard-panel-border focus-visible:ring-ring flex min-h-11 shrink-0 items-center justify-between gap-4 rounded-lg px-3 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:w-full",
      selected
        ? "bg-dashboard-muted/15 text-dashboard-foreground"
        : "text-dashboard-muted hover:bg-dashboard-muted/10 hover:text-dashboard-foreground border-transparent",
      className
    )}
    {...props}
  >
    {children}
    {selected && (
      <span
        className="bg-primary h-1.5 w-1.5 rounded-full"
        aria-hidden="true"
      />
    )}
  </button>
));
DashboardSidebarNavItem.displayName = "DashboardSidebarNavItem";

interface DashboardMetricCardProps extends React.HTMLAttributes<HTMLElement> {
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
        <div className="text-dashboard-muted flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="text-primary h-5 w-5 shrink-0" />}
          <span>{label}</span>
        </div>
        {indicator && <div className="shrink-0">{indicator}</div>}
      </div>
      <div
        className={cn(
          "text-dashboard-foreground font-mono text-3xl font-bold",
          valueClassName
        )}
      >
        {value}
      </div>
    </>
  );

  const classes = cn(
    appSurfaceVariants({ variant: "default", size: "lg" }),
    "flex min-h-dashboard-metric-card flex-col justify-between gap-4 border-dashboard-panel-border bg-dashboard-panel text-left text-dashboard-foreground shadow-[0_2px_12px_rgb(0_0_0_/_0.24)] transition-colors hover:border-primary/30",
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
      className={cn(
        "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground flex h-full flex-col overflow-hidden shadow-[0_2px_12px_rgb(0_0_0_/_0.24)]",
        className
      )}
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
          <AppSurfaceTitle className="text-dashboard-foreground text-base">
            {title}
          </AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription className="text-dashboard-muted">
              {description}
            </AppSurfaceDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("flex-1 p-6 pt-3", contentClassName)}>{children}</div>
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
        "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground text-center shadow-[0_2px_12px_rgb(0_0_0_/_0.24)]",
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
          <AppSurfaceTitle className="font-display text-dashboard-foreground text-3xl font-light">
            {title}
          </AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription className="text-dashboard-muted mx-auto max-w-md text-lg">
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

interface DashboardLoadingStateProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

function DashboardLoadingState({
  className,
  label = "Loading section...",
  children,
  ...props
}: DashboardLoadingStateProps) {
  return (
    <div
      className={cn(
        "min-h-dashboard-loading flex items-center justify-center",
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {children || <Loader2 className="text-primary h-8 w-8 animate-spin" />}
        {label && <p className="text-dashboard-muted text-sm">{label}</p>}
      </div>
    </div>
  );
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
        variant === "metric"
          ? "min-h-dashboard-metric-card"
          : "min-h-dashboard-chart-card",
        "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground",
        className
      )}
      {...props}
    >
      {children ||
        (variant === "metric" ? (
          <div className="space-y-3">
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            <div className="bg-muted h-9 w-20 animate-pulse rounded" />
            <div className="bg-muted h-5 w-28 animate-pulse rounded" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-muted h-5 w-36 animate-pulse rounded" />
            <div className="h-chart-radar bg-muted animate-pulse rounded" />
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
      className={cn(
        "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground flex flex-col overflow-hidden shadow-[0_2px_12px_rgb(0_0_0_/_0.24)]",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4 p-6 pb-3">
        <div className="space-y-1">
          <AppSurfaceTitle className="font-display text-dashboard-muted text-sm font-light tracking-wider uppercase">
            {title}
          </AppSurfaceTitle>
          {description && (
            <AppSurfaceDescription className="text-dashboard-muted">
              {description}
            </AppSurfaceDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("flex-1 p-6 pt-0", contentClassName)}>{children}</div>
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
        "border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground hover:border-primary/30 shadow-[0_2px_12px_rgb(0_0_0_/_0.24)] transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 space-y-3">
          {(eyebrow || icon) && (
            <div className="text-primary flex items-center gap-2 text-sm font-medium">
              {icon}
              {eyebrow && <span>{eyebrow}</span>}
            </div>
          )}
          <AppSurfaceTitle className="font-display text-dashboard-foreground text-2xl font-light">
            {title}
          </AppSurfaceTitle>
          <AppSurfaceDescription className="text-dashboard-muted max-w-2xl text-sm">
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
  DashboardSidebarNavItem,
  DashboardMetricCard,
  DashboardChartCard,
  DashboardStateCard,
  DashboardLoadingState,
  DashboardSkeletonCard,
  DashboardSectionCard,
  DashboardActionCard,
};

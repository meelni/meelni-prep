import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const appSurfaceVariants = cva("rounded-lg border text-card-foreground", {
  variants: {
    variant: {
      default: "border-border bg-card shadow-sm",
      panel: "border-border bg-surface shadow-sm",
      muted: "border-border/50 bg-card/50",
      accent:
        "border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 shadow-sm",
    },
    size: {
      none: "p-0",
      sm: "p-3",
      md: "p-4",
      lg: "p-6",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

export interface AppSurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof appSurfaceVariants> {}

const AppSurface = React.forwardRef<HTMLDivElement, AppSurfaceProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(appSurfaceVariants({ variant, size, className }))}
      {...props}
    />
  )
);
AppSurface.displayName = "AppSurface";

const AppSurfaceHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("border-border bg-muted/50 border-b p-4", className)}
    {...props}
  />
));
AppSurfaceHeader.displayName = "AppSurfaceHeader";

const AppSurfaceTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-foreground text-lg font-semibold", className)}
    {...props}
  />
));
AppSurfaceTitle.displayName = "AppSurfaceTitle";

const AppSurfaceDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-muted-foreground text-xs", className)}
    {...props}
  />
));
AppSurfaceDescription.displayName = "AppSurfaceDescription";

const statusPillVariants = cva(
  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        primary: "border-primary/20 bg-primary/10 text-primary",
        muted: "border-border bg-background/50 text-muted-foreground",
        warning:
          "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-500",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "muted",
    },
  }
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {}

const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, tone, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(statusPillVariants({ tone, className }))}
      {...props}
    />
  )
);
StatusPill.displayName = "StatusPill";

export {
  AppSurface,
  AppSurfaceHeader,
  AppSurfaceTitle,
  AppSurfaceDescription,
  StatusPill,
  appSurfaceVariants,
  statusPillVariants,
};

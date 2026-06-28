import * as React from "react";
import type { LucideIcon } from "lucide-react";

import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  appSurfaceVariants,
} from "@/components/ui/app-surface";
import { cn } from "@/lib/utils";

function MarketingPage({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-h-screen bg-gradient-to-b from-background via-muted/5 to-background",
        className
      )}
      {...props}
    />
  );
}

interface MarketingEyebrowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  mark?: React.ReactNode;
}

function MarketingEyebrow({
  className,
  icon: Icon,
  mark,
  children,
  ...props
}: MarketingEyebrowProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary",
        className
      )}
      {...props}
    >
      {(Icon || mark) && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {Icon ? <Icon className="h-3.5 w-3.5" /> : mark}
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}

interface MarketingHeroProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
}

function MarketingHero({
  className,
  eyebrow,
  title,
  description,
  ...props
}: MarketingHeroProps) {
  return (
    <div className={cn("mb-20 space-y-6 text-center", className)} {...props}>
      {eyebrow}
      <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl">
        {title}
      </h1>
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

interface MarketingArticleHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
}

function MarketingArticleHeader({
  className,
  eyebrow,
  title,
  meta,
  ...props
}: MarketingArticleHeaderProps) {
  return (
    <header className={cn("space-y-8", className)} {...props}>
      <div>{eyebrow}</div>
      <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      {meta}
    </header>
  );
}

function MarketingProse({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "prose prose-lg max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-a:font-medium prose-a:text-primary prose-strong:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function MarketingCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        appSurfaceVariants({ size: "none" }),
        "group flex h-full flex-col overflow-hidden bg-card/70 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10",
        className
      )}
      {...props}
    />
  );
}

interface MarketingMetaRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items: Array<{
    icon: LucideIcon;
    label: React.ReactNode;
  }>;
}

function MarketingMetaRow({
  className,
  items,
  children,
  ...props
}: MarketingMetaRowProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      {items.map(({ icon: Icon, label }, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

interface MarketingCtaCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  mark?: React.ReactNode;
  tone?: "primary" | "success" | "muted" | "danger";
  title: React.ReactNode;
  description: React.ReactNode;
  action: React.ReactNode;
  footer?: React.ReactNode;
}

function MarketingCtaCard({
  className,
  mark,
  tone = "primary",
  title,
  description,
  action,
  footer,
  ...props
}: MarketingCtaCardProps) {
  return (
    <AppSurface
      variant="accent"
      size="lg"
      className={cn("overflow-hidden text-center", className)}
      {...props}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        {mark && (
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold shadow-lg",
              tone === "primary" &&
                "bg-primary text-primary-foreground shadow-primary/20",
              tone === "success" &&
                "bg-success/10 text-success shadow-success/10",
              tone === "muted" &&
                "bg-muted text-muted-foreground shadow-muted/10",
              tone === "danger" &&
                "bg-destructive/10 text-destructive shadow-destructive/10"
            )}
          >
            {mark}
          </div>
        )}
        <div className="space-y-2">
          <AppSurfaceTitle className="font-display text-3xl font-bold">
            {title}
          </AppSurfaceTitle>
          <AppSurfaceDescription className="text-base leading-relaxed">
            {description}
          </AppSurfaceDescription>
        </div>
        {action}
        {footer && (
          <AppSurfaceDescription className="text-sm leading-relaxed">
            {footer}
          </AppSurfaceDescription>
        )}
      </div>
    </AppSurface>
  );
}

export {
  MarketingPage,
  MarketingHero,
  MarketingArticleHeader,
  MarketingProse,
  MarketingEyebrow,
  MarketingCard,
  MarketingCtaCard,
  MarketingMetaRow,
};

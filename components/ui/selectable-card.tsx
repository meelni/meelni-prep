"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SelectableCardProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  locked?: boolean;
}

const SelectableCard = React.forwardRef<HTMLButtonElement, SelectableCardProps>(
  ({ className, selected, locked, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      aria-disabled={locked || undefined}
      data-selected={selected ? "" : undefined}
      data-locked={locked ? "" : undefined}
      className={cn(
        "group focus-visible:ring-ring relative h-full w-full cursor-pointer overflow-hidden rounded-lg border-2 p-4 text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        selected
          ? "border-primary bg-card ring-primary/20 shadow-md ring-2"
          : "border-border bg-card hover:border-primary/50 hover:bg-accent",
        locked && "hover:bg-background opacity-60",
        className
      )}
      {...props}
    />
  )
);
SelectableCard.displayName = "SelectableCard";

interface SelectableCardIconProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

function SelectableCardIcon({
  className,
  selected,
  ...props
}: SelectableCardIconProps) {
  return (
    <div
      className={cn(
        "inline-flex w-fit rounded-lg p-2 transition-colors duration-200",
        selected
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground group-hover:text-primary",
        className
      )}
      {...props}
    />
  );
}

interface SelectableCardCheckProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md";
}

function SelectableCardCheck({
  className,
  size = "md",
  ...props
}: SelectableCardCheckProps) {
  return (
    <div
      className={cn(
        "bg-primary text-primary-foreground flex items-center justify-center rounded-full",
        size === "sm" ? "h-5 w-5" : "h-6 w-6",
        className
      )}
      {...props}
    >
      <Check className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
    </div>
  );
}

interface SelectableCardLockOverlayProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

function SelectableCardLockOverlay({
  className,
  label = "Click to upgrade",
  ...props
}: SelectableCardLockOverlayProps) {
  return (
    <div
      className={cn(
        "bg-background absolute inset-0 flex items-center justify-center rounded-lg",
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="text-muted-foreground h-6 w-6" />
        </div>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}

export {
  SelectableCard,
  SelectableCardIcon,
  SelectableCardCheck,
  SelectableCardLockOverlay,
};

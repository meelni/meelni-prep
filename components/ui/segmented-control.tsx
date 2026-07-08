"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const segmentedControlVariants = cva(
  "inline-grid overflow-hidden rounded-md border",
  {
    variants: {
      tone: {
        default: "border-border",
        dashboard: "border-dashboard-panel-border",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

const segmentedControlItemVariants = cva(
  "inline-flex h-8 min-w-0 items-center justify-center border-r px-3 text-xs font-medium transition-colors last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      tone: {
        default: "border-border",
        dashboard: "border-dashboard-panel-border",
      },
      selected: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        tone: "default",
        selected: true,
        className: "bg-primary text-primary-foreground",
      },
      {
        tone: "default",
        selected: false,
        className:
          "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      {
        tone: "dashboard",
        selected: true,
        className: "bg-dashboard-muted/15 text-dashboard-foreground",
      },
      {
        tone: "dashboard",
        selected: false,
        className:
          "bg-transparent text-dashboard-muted hover:bg-dashboard-muted/10 hover:text-dashboard-foreground",
      },
    ],
    defaultVariants: {
      tone: "default",
      selected: false,
    },
  }
);

interface SegmentedControlProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof segmentedControlVariants> {
  columns?: number;
}

function SegmentedControl({
  className,
  columns,
  tone,
  style,
  ...props
}: SegmentedControlProps) {
  return (
    <div
      role="group"
      className={cn(segmentedControlVariants({ tone }), className)}
      style={{
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : undefined,
        ...style,
      }}
      {...props}
    />
  );
}

interface SegmentedControlItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof segmentedControlItemVariants> {
  selected?: boolean;
}

const SegmentedControlItem = React.forwardRef<
  HTMLButtonElement,
  SegmentedControlItemProps
>(({ className, tone, selected, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={selected}
    className={cn(segmentedControlItemVariants({ tone, selected }), className)}
    {...props}
  />
));
SegmentedControlItem.displayName = "SegmentedControlItem";

export {
  SegmentedControl,
  SegmentedControlItem,
  segmentedControlVariants,
  segmentedControlItemVariants,
};

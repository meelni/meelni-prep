import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const filterPillVariants = cva(
  "inline-flex items-center rounded-full border text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20",
        false:
          "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
      },
      size: {
        sm: "px-2.5 py-1 h-7",
        md: "px-3 py-1.5 h-8",
        lg: "px-4 py-2 h-9",
      },
    },
    defaultVariants: {
      active: false,
      size: "md",
    },
  }
);

export interface FilterPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof filterPillVariants> {
  active?: boolean;
}

const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ className, active, size, ...props }, ref) => {
    return (
      <button
        className={cn(filterPillVariants({ active, size }), className)}
        ref={ref}
        aria-pressed={active}
        data-active={active ? "true" : undefined}
        {...props}
      />
    );
  }
);

FilterPill.displayName = "FilterPill";

export { FilterPill, filterPillVariants };

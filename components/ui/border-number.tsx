import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";

interface BorderTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string;
}

export const BorderText = forwardRef<HTMLDivElement, BorderTextProps>(
  ({ text, className, ...props }, ref) => {
    return (
      <div className="flex items-center justify-center">
        <span
          ref={ref}
          style={{ "--text": `'${text}'` } as React.CSSProperties}
          className={cn(
            `before:from-foreground/25 before:to-muted-foreground/20 dark:before:from-foreground/35 dark:before:to-muted-foreground/20 after:bg-muted-foreground/35 dark:after:bg-muted-foreground/45 pointer-events-none relative text-center font-mono text-8xl leading-none font-bold before:bg-gradient-to-b before:to-80% before:bg-clip-text before:text-transparent before:content-[var(--text)] after:absolute after:inset-0 after:bg-clip-text after:text-transparent after:mix-blend-darken after:content-[var(--text)] after:[text-shadow:0_1px_0_var(--background)] dark:after:mix-blend-lighten`,
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

BorderText.displayName = "BorderText";

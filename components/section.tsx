"use client";

import FlickeringGrid from "@/components/ui/flickering-grid";
import { cn } from "@/lib/utils";
import React, { forwardRef, useRef } from "react";

interface SectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

const Section = forwardRef<HTMLElement, SectionProps>(
  (
    { id, title, subtitle, description, children, className, align },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLElement>(null);
    const ref = forwardedRef || internalRef;
    const alignmentClass =
      align === "left"
        ? "text-left"
        : align === "right"
          ? "text-right"
          : "text-center";

    return (
      <section id={id} ref={ref}>
        <div className={cn("relative w-full", className)}>
          {(title || subtitle || description) && (
            <div
              className={cn(
                alignmentClass,
                "relative mx-auto overflow-hidden border-t p-2 py-8 md:p-12"
              )}
            >
              {title && (
                <h2 className="text-muted-foreground tracking-tigh text-sm font-semibold text-balance uppercase">
                  {title}
                </h2>
              )}

              {subtitle && (
                <h3
                  className={cn(
                    "text-foreground mx-0 mt-4 max-w-lg text-5xl leading-[1.2] font-bold tracking-tighter text-balance lowercase sm:max-w-none sm:text-4xl md:text-5xl lg:text-6xl",
                    align === "center"
                      ? "mx-auto"
                      : align === "right"
                        ? "ml-auto"
                        : ""
                  )}
                >
                  {subtitle}
                </h3>
              )}
              {description && (
                <p
                  className={cn(
                    "text-muted-foreground mt-6 max-w-2xl text-lg leading-8 text-balance",
                    align === "center"
                      ? "mx-auto"
                      : align === "right"
                        ? "ml-auto"
                        : ""
                  )}
                >
                  {description}
                </p>
              )}
              <div className="from-background dark:from-background pointer-events-none absolute right-0 bottom-0 left-0 -z-10 h-full w-full bg-gradient-to-t from-50%" />
              <FlickeringGrid
                squareSize={4}
                gridGap={4}
                color="var(--muted-foreground)"
                maxOpacity={0.2}
                flickerChance={0.1}
                className="absolute inset-0 -z-20 size-full"
              />
            </div>
          )}
          {children}
        </div>
      </section>
    );
  }
);

Section.displayName = "Section";

export { Section };

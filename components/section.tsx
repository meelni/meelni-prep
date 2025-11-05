'use client';

import { cn } from '@/lib/utils';
import React, { forwardRef, useRef } from 'react';

interface SectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

const Section = forwardRef<HTMLElement, SectionProps>(
  (
    { id, title, subtitle, description, children, className, align },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLElement>(null);
    const ref = forwardedRef || internalRef;
    const alignmentClass =
      align === 'left'
        ? 'text-left'
        : align === 'right'
          ? 'text-right'
          : 'text-center';

    return (
      <section id={id} ref={ref}>
        <div className={cn('relative mx-auto container max-w-6xl', className)}>
          {(title || subtitle || description) && (
            <div
              className={cn(
                alignmentClass,
                'relative mx-auto border-x border-t overflow-hidden p-6 py-12 md:p-16'
              )}
            >
              {title && (
                <h2 className="text-sm text-muted-foreground text-balance font-semibold tracking-tight uppercase">
                  {title}
                </h2>
              )}

              {subtitle && (
                <h3
                  className={cn(
                    'mx-0 mt-4 max-w-lg text-4xl text-balance font-bold sm:max-w-none sm:text-4xl md:text-5xl leading-[1.2] tracking-tighter text-foreground',
                    align === 'center'
                      ? 'mx-auto'
                      : align === 'right'
                        ? 'ml-auto'
                        : ''
                  )}
                >
                  {subtitle}
                </h3>
              )}
              {description && (
                <p
                  className={cn(
                    'mt-6 text-lg leading-8 text-muted-foreground text-balance max-w-2xl',
                    align === 'center'
                      ? 'mx-auto'
                      : align === 'right'
                        ? 'ml-auto'
                        : ''
                  )}
                >
                  {description}
                </p>
              )}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-full w-full bg-gradient-to-t from-background -z-10 from-50%" />
            </div>
          )}
          {children}
        </div>
      </section>
    );
  }
);

Section.displayName = 'Section';

export { Section };

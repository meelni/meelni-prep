import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DashboardPageProps {
  label: string;
  children: ReactNode;
  bodyClassName?: string;
}

export function DashboardPage({
  label,
  children,
  bodyClassName,
}: DashboardPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col text-dashboard-foreground">
      <header className="flex h-10 shrink-0 items-center border-b border-dashboard-panel-border bg-transparent px-6 sm:px-8">
        <p className="text-dashboard-muted text-xs font-bold tracking-[0.28em] uppercase">
          {label}
        </p>
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6",
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

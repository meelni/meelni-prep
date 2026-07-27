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
    <div className="text-dashboard-foreground flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center bg-transparent px-6 sm:px-8">
        <h1 className="text-dashboard-muted text-sm font-semibold">{label}</h1>
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

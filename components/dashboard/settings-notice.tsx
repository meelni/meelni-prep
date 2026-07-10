"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function SettingsNotice({
  title,
  description,
  tone = "default",
  announce,
  focusOnMount = false,
  action,
}: {
  title: string;
  description: string;
  tone?: "default" | "warning" | "success";
  announce?: "polite" | "assertive";
  focusOnMount?: boolean;
  action?: ReactNode;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      noticeRef.current?.focus();
    }
  }, [focusOnMount]);

  const NoticeIcon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      ref={noticeRef}
      role={
        announce === "assertive" ? "alert" : announce ? "status" : undefined
      }
      aria-live={announce}
      aria-atomic={announce ? "true" : undefined}
      tabIndex={focusOnMount ? -1 : undefined}
      className={cn(
        "border-dashboard-panel-border bg-dashboard-muted/10 focus-visible:ring-ring mb-6 flex gap-3 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none",
        tone === "warning" && "border-warning/30 bg-warning/10",
        tone === "success" && "border-success/30 bg-success/10"
      )}
    >
      <NoticeIcon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          tone === "default" && "text-dashboard-muted"
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-dashboard-foreground text-sm font-bold">{title}</p>
        <p className="text-dashboard-muted mt-1 text-sm leading-5">
          {description}
        </p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

import * as React from "react";

interface ConsentBannerSurfaceProps {
  title: React.ReactNode;
  titleId: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}

/** Floating presentation shared by every analytics-consent state contract. */
export function ConsentBannerSurface({
  title,
  titleId,
  actions,
  children,
}: ConsentBannerSurfaceProps) {
  return (
    <>
      <div
        className="bg-card fixed inset-0 z-40 hidden max-[240px]:block"
        aria-hidden="true"
      />
      <aside
        className="border-border bg-card text-card-foreground fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 ml-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-lg border p-4 shadow-lg max-[240px]:inset-0 max-[240px]:max-h-none max-[240px]:max-w-none max-[240px]:rounded-none max-[240px]:border-0 max-[240px]:shadow-none sm:left-auto"
        aria-labelledby={titleId}
        aria-live="polite"
        data-cookie-consent-banner
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            <div className="text-muted-foreground text-xs leading-relaxed [overflow-wrap:anywhere]">
              {children}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{actions}</div>
        </div>
      </aside>
    </>
  );
}

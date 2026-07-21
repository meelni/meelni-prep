import * as React from "react";

interface ConsentBannerSurfaceProps {
  title: React.ReactNode;
  titleId: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}

/** Normal-flow presentation shared by every analytics-consent state contract. */
export function ConsentBannerSurface({
  title,
  titleId,
  actions,
  children,
}: ConsentBannerSurfaceProps) {
  return (
    <aside
      className="border-border bg-card text-card-foreground relative z-40 w-full border-b"
      aria-labelledby={titleId}
      data-cookie-consent-banner
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <div className="text-muted-foreground max-w-3xl text-sm leading-6 [overflow-wrap:anywhere]">
            {children}
          </div>
        </div>
        <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-72">
          {actions}
        </div>
      </div>
    </aside>
  );
}

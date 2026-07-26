"use client";

import { usePathname } from "next/navigation";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { ConsentBannerSurface } from "@/components/analytics/consent-banner-surface";
import { Button } from "@/components/ui/button";

export function CookieConsentBanner() {
  const pathname = usePathname();
  const { decision, error, resolved, savingDecision, setConsent } =
    useAnalyticsConsent();
  const saving = savingDecision !== null;
  const isFocusedInterview = pathname?.startsWith("/interview");
  if (!resolved || decision !== "undecided" || isFocusedInterview) return null;

  return (
    <ConsentBannerSurface
      title="Cookie preferences"
      titleId="analytics-consent-title"
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-foreground/50 min-h-11"
            disabled={saving}
            onClick={() => void setConsent("declined", "banner")}
          >
            {savingDecision === "declined" ? "Turning off..." : "Decline"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-foreground/50 min-h-11"
            disabled={saving}
            onClick={() => void setConsent("accepted", "banner")}
          >
            {savingDecision === "accepted" ? "Enabling..." : "Allow analytics"}
          </Button>
        </>
      }
    >
      <p className="bg-card">
        With your permission, we use analytics cookies and similar technologies
        to improve Meelni. Interview content is never included.
      </p>
      {error && (
        <p className="text-destructive mt-1" role="alert">
          {error}
        </p>
      )}
    </ConsentBannerSurface>
  );
}

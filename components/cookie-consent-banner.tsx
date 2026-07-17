"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { Button } from "@/components/ui/button";

export function CookieConsentBanner() {
  const pathname = usePathname();
  const { decision, error, resolved, savingDecision, setConsent } =
    useAnalyticsConsent();
  const saving = savingDecision !== null;
  const isFocusedInterview = pathname?.startsWith("/interview");
  if (!resolved || decision !== "undecided" || isFocusedInterview) return null;

  return (
    <aside
      className="border-border bg-card fixed right-4 bottom-4 left-4 z-50 ml-auto max-w-md rounded-lg border p-4 shadow-lg sm:left-auto"
      aria-labelledby="analytics-consent-title"
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 id="analytics-consent-title" className="text-sm font-semibold">
            Optional product analytics
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Allow Meelni to use PostHog and Statsig to understand product usage.
            Interview audio, transcripts, questions, and answers are never
            included.
          </p>
          <Link
            href="/privacy"
            className="text-primary text-xs underline-offset-4 hover:underline"
          >
            Read the privacy draft
          </Link>
        </div>
        {error && (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void setConsent("declined", "banner")}
          >
            {savingDecision === "declined" ? "Turning off..." : "Decline"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void setConsent("accepted", "banner")}
          >
            {savingDecision === "accepted" ? "Enabling..." : "Allow analytics"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

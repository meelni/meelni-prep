"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already made a decision
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      // No decision yet - show banner but allow tracking by default
      // This is GDPR-compliant as we show notice and allow opt-out
      setShowBanner(true);
      // Don't opt out by default - let PostHog track until user explicitly declines
    } else if (consent === "declined") {
      // User explicitly declined - opt out of tracking
      posthog.opt_out_capturing();
    }
    // If accepted, do nothing - PostHog is already tracking by default
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    posthog.opt_in_capturing();
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "declined");
    posthog.opt_out_capturing();
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="relative rounded-lg border border-border bg-card p-4 shadow-lg backdrop-blur-xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDecline}
          className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="pr-6">
          <h3 className="mb-2 text-sm font-semibold">Cookie Preferences</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            We use cookies to improve your experience and analyze product usage. Your data is anonymized and helps us make Meelni better.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleAccept} size="sm" className="flex-1">
              Accept
            </Button>
            <Button onClick={handleDecline} size="sm" variant="outline" className="flex-1">
              Decline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";

type ConsentDecision = "accepted" | "declined" | "undecided";
type WritableDecision = Exclude<ConsentDecision, "undecided">;

function initialDecision(): ConsentDecision {
  const scenario = new URLSearchParams(window.location.search).get("scenario");
  if (scenario === "consent-accepted") return "accepted";
  if (scenario === "consent-declined") return "declined";
  return "undecided";
}

export function AnalyticsConsentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

export function useAnalyticsConsent() {
  const [decision, setDecision] = useState<ConsentDecision>(initialDecision);
  const [savingDecision, setSavingDecision] = useState<WritableDecision | null>(
    null
  );

  return {
    accountSyncPending: false,
    analyticsPseudonym: null,
    consent: { decision },
    decision,
    error: null,
    resolved: true,
    resolvedForUserId: null,
    savingDecision,
    retryAccountSync: async () => true,
    setConsent: async (nextDecision: WritableDecision) => {
      setSavingDecision(nextDecision);
      setDecision(nextDecision);
      setSavingDecision(null);
      return true;
    },
  };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/app/providers/auth-provider";
import {
  ANALYTICS_CONSENT_POLICY_VERSION,
  ANONYMOUS_CONSENT_SUBJECT,
  UNDECIDED_ANALYTICS_CONSENT,
  createAnalyticsConsentDecision,
  analyticsConsentSubjectKey,
  effectiveAnalyticsDecision,
  isConsentResolvedForSubject,
  shouldApplyConsentResponse,
  type AnalyticsConsentDecision,
  type AnalyticsConsentSnapshot,
} from "@/lib/analytics/consent-contract";
import { clearStatsigAnonymousIdentifiers } from "@/lib/feature-flags/anonymous-id";
import { purgeLegacyPostHogIdentity } from "@/lib/analytics/posthog-legacy-purge";
import { analytics } from "@/lib/analytics/analytics-service";

type ConsentWriteDecision = "accepted" | "declined";
type ConsentWriteSource = "banner" | "settings" | "legacy_decline";

interface AnalyticsConsentContextValue {
  accountSyncPending: boolean;
  analyticsPseudonym: string | null;
  consent: AnalyticsConsentSnapshot;
  decision: AnalyticsConsentDecision;
  error: string | null;
  resolved: boolean;
  resolvedForUserId: string | null;
  savingDecision: ConsentWriteDecision | null;
  retryAccountSync: () => Promise<boolean>;
  setConsent: (
    decision: ConsentWriteDecision,
    source: ConsentWriteSource
  ) => Promise<boolean>;
}

interface ConsentApiResponse {
  analyticsPseudonym: string | null;
  consent: AnalyticsConsentSnapshot;
  error?: string;
  persistence?: {
    account?: boolean;
    accountRevision?: number | null;
    browserOnly?: boolean;
  };
}

const AnalyticsConsentContext = createContext<
  AnalyticsConsentContextValue | undefined
>(undefined);

export function AnalyticsConsentProvider({
  children,
  initialAccountRevision = null,
  initialAccountSyncPending = false,
  initialAnalyticsPseudonym = null,
  initialConsent = UNDECIDED_ANALYTICS_CONSENT,
  initialResolvedForSubject = null,
}: {
  children: React.ReactNode;
  initialAccountRevision?: number | null;
  initialAccountSyncPending?: boolean;
  initialAnalyticsPseudonym?: string | null;
  initialConsent?: AnalyticsConsentSnapshot;
  initialResolvedForSubject?: string | null;
}) {
  const { isLoading, user } = useAuth();
  const currentSubject = analyticsConsentSubjectKey(isLoading, user?.id);
  const latestSubjectRef = useRef<string | null>(currentSubject);
  latestSubjectRef.current = currentSubject;
  const requestSequenceRef = useRef(0);
  const accountRevisionRef = useRef<number | null>(initialAccountRevision);
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const previousSubjectRef = useRef<string | null>(initialResolvedForSubject);
  const [consent, setConsentState] = useState(initialConsent);
  const [resolvedSubject, setResolvedSubject] = useState<string | null>(
    initialResolvedForSubject
  );
  const [analyticsPseudonym, setAnalyticsPseudonym] = useState(
    initialAnalyticsPseudonym
  );
  const [accountSyncPending, setAccountSyncPending] = useState(
    initialAccountSyncPending
  );
  const [savingDecision, setSavingDecision] =
    useState<ConsentWriteDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolved = isConsentResolvedForSubject(currentSubject, resolvedSubject);
  const effectiveConsent = resolved ? consent : UNDECIDED_ANALYTICS_CONSENT;
  const decision = effectiveAnalyticsDecision(effectiveConsent);

  useLayoutEffect(() => {
    purgeLegacyPostHogIdentity();
  }, []);

  useEffect(() => {
    // Auth hydration temporarily has no trusted subject. Preserve the server-
    // resolved state until auth resolves to an actual account or anonymous.
    if (currentSubject === null) return;
    if (
      previousSubjectRef.current !== null &&
      previousSubjectRef.current !== currentSubject
    ) {
      analytics.reset();
      clearStatsigAnonymousIdentifiers();
      setAnalyticsPseudonym(null);
      accountRevisionRef.current = null;
      setAccountSyncPending(false);
      setError(null);
      requestSequenceRef.current += 1;
    }
    previousSubjectRef.current = currentSubject;
  }, [currentSubject]);

  const setConsent = useCallback(
    async (
      decisionToWrite: ConsentWriteDecision,
      source: ConsentWriteSource
    ) => {
      const subject = latestSubjectRef.current;
      if (!subject) return false;
      const sequence = ++requestSequenceRef.current;
      setSavingDecision(decisionToWrite);
      setError(null);

      if (decisionToWrite === "declined") {
        analytics.reset();
        clearStatsigAnonymousIdentifiers();
        setAnalyticsPseudonym(null);
        setConsentState(
          createAnalyticsConsentDecision(
            "declined",
            source,
            subject === ANONYMOUS_CONSENT_SUBJECT ? "anonymous" : "account"
          )
        );
        setResolvedSubject(subject);
      }

      const write = writeChainRef.current.then(async () => {
        if (latestSubjectRef.current !== subject) {
          throw new Error("consent_subject_changed");
        }
        const response = await fetch("/api/analytics/consent", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: decisionToWrite,
            expectedRevision:
              subject === ANONYMOUS_CONSENT_SUBJECT
                ? undefined
                : accountRevisionRef.current,
            policyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
            source,
          }),
        });
        const data = (await response.json()) as Partial<ConsentApiResponse>;
        if (
          response.status === 409 &&
          data.error === "consent_policy_outdated"
        ) {
          return { kind: "policy_outdated" } as const;
        }
        if (!response.ok && !isConsentConflictResponse(response, data)) {
          throw new Error("consent_persistence_failed");
        }
        return {
          kind: "consent",
          data: data as ConsentApiResponse,
        } as const;
      });
      writeChainRef.current = write.catch(() => undefined);

      try {
        const result = await write;
        if (
          !shouldApplyConsentResponse(
            sequence,
            requestSequenceRef.current,
            subject,
            latestSubjectRef.current
          )
        ) {
          return false;
        }
        if (result.kind === "policy_outdated") {
          analytics.reset();
          clearStatsigAnonymousIdentifiers();
          accountRevisionRef.current = null;
          setAnalyticsPseudonym(null);
          setConsentState(UNDECIDED_ANALYTICS_CONSENT);
          setResolvedSubject(null);
          setAccountSyncPending(false);
          setError(
            "Analytics are off while your updated privacy choice loads."
          );
          return false;
        }
        const data = result.data;
        setConsentState(data.consent);
        if (data.consent.decision !== "accepted") {
          analytics.reset();
          clearStatsigAnonymousIdentifiers();
        }
        accountRevisionRef.current =
          data.persistence?.accountRevision ?? accountRevisionRef.current;
        setResolvedSubject(subject);
        setAnalyticsPseudonym(data.analyticsPseudonym);
        const pending =
          subject !== ANONYMOUS_CONSENT_SUBJECT &&
          data.persistence?.browserOnly !== true &&
          data.persistence?.account !== true;
        setAccountSyncPending(pending);
        setError(
          data.error === "consent_conflict"
            ? "Your analytics choice changed elsewhere. Review the current setting before enabling analytics."
            : pending
              ? "Analytics are off on this browser, but your account still needs to sync."
              : null
        );
        return data.error !== "consent_conflict";
      } catch {
        if (
          !shouldApplyConsentResponse(
            sequence,
            requestSequenceRef.current,
            subject,
            latestSubjectRef.current
          )
        ) {
          return false;
        }
        if (decisionToWrite === "declined") {
          const pending =
            subject !== ANONYMOUS_CONSENT_SUBJECT &&
            source !== "legacy_decline";
          setAccountSyncPending(pending);
          setError(
            pending
              ? "Analytics are off on this browser, but account sync failed. Retry below."
              : "Analytics are off for this visit, but the browser preference could not be saved."
          );
          return true;
        }
        setError(
          "Analytics were not enabled because your choice could not be saved."
        );
        return false;
      } finally {
        if (sequence === requestSequenceRef.current) setSavingDecision(null);
      }
    },
    []
  );

  const retryAccountSync = useCallback(async () => {
    if (!accountSyncPending || decision === "undecided") return false;
    return setConsent(
      decision === "accepted" ? "accepted" : "declined",
      "settings"
    );
  }, [accountSyncPending, decision, setConsent]);

  useEffect(() => {
    if (!currentSubject || resolvedSubject === currentSubject) return;
    const subject = currentSubject;
    const sequence = ++requestSequenceRef.current;
    let active = true;
    fetch("/api/analytics/consent", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("consent_load_failed");
        return (await response.json()) as ConsentApiResponse;
      })
      .then((data) => {
        if (
          !active ||
          !shouldApplyConsentResponse(
            sequence,
            requestSequenceRef.current,
            subject,
            latestSubjectRef.current
          )
        ) {
          return;
        }
        setConsentState(data.consent);
        accountRevisionRef.current =
          data.persistence?.accountRevision ?? accountRevisionRef.current;
        setResolvedSubject(subject);
        setAnalyticsPseudonym(data.analyticsPseudonym);
        const pending =
          subject !== ANONYMOUS_CONSENT_SUBJECT &&
          data.persistence?.browserOnly !== true &&
          data.persistence?.account !== true &&
          data.consent.decision !== "undecided";
        setAccountSyncPending(pending);
        setError(
          pending
            ? "Analytics are off locally, but your account choice still needs to sync."
            : null
        );
      })
      .catch(() => {
        if (
          !active ||
          !shouldApplyConsentResponse(
            sequence,
            requestSequenceRef.current,
            subject,
            latestSubjectRef.current
          )
        ) {
          return;
        }
        setConsentState(UNDECIDED_ANALYTICS_CONSENT);
        setResolvedSubject(subject);
        setAnalyticsPseudonym(null);
        setError(
          "Analytics remain off because your privacy choice could not load."
        );
      });
    return () => {
      active = false;
    };
  }, [currentSubject, resolvedSubject]);

  useLayoutEffect(() => {
    if (!resolved) return;
    try {
      const legacy = window.localStorage.getItem("cookie-consent");
      window.localStorage.removeItem("cookie-consent");
      if (legacy === "declined" && decision !== "declined") {
        void setConsent("declined", "legacy_decline");
      }
    } catch {
      // Storage can be unavailable; undecided remains fail-closed.
    }
  }, [decision, resolved, setConsent]);

  const value = useMemo<AnalyticsConsentContextValue>(
    () => ({
      accountSyncPending,
      analyticsPseudonym:
        resolved && decision === "accepted" ? analyticsPseudonym : null,
      consent: effectiveConsent,
      decision,
      error,
      resolved,
      resolvedForUserId:
        resolved && currentSubject !== ANONYMOUS_CONSENT_SUBJECT
          ? currentSubject
          : null,
      retryAccountSync,
      savingDecision,
      setConsent,
    }),
    [
      accountSyncPending,
      analyticsPseudonym,
      currentSubject,
      decision,
      effectiveConsent,
      error,
      resolved,
      retryAccountSync,
      savingDecision,
      setConsent,
    ]
  );
  return (
    <AnalyticsConsentContext.Provider value={value}>
      {children}
    </AnalyticsConsentContext.Provider>
  );
}

function isConsentConflictResponse(
  response: Response,
  data: Partial<ConsentApiResponse>
): data is ConsentApiResponse & { error: "consent_conflict" } {
  const consent = data.consent;
  if (!consent) return false;
  const pseudonymIsValid =
    consent.decision === "declined"
      ? data.analyticsPseudonym === null
      : typeof data.analyticsPseudonym === "string";
  return (
    response.status === 409 &&
    data.error === "consent_conflict" &&
    data.persistence?.account === true &&
    Number.isSafeInteger(data.persistence.accountRevision) &&
    (data.persistence.accountRevision ?? -1) >= 0 &&
    data.persistence.browserOnly === false &&
    (consent.decision === "accepted" || consent.decision === "declined") &&
    pseudonymIsValid &&
    consent.scope === "account" &&
    ["banner", "settings", "legacy_decline", "account_sync"].includes(
      consent.source
    ) &&
    Number.isSafeInteger(consent.policyVersion) &&
    consent.policyVersion > 0 &&
    Number.isFinite(new Date(consent.decidedAt).getTime())
  );
}

export function useAnalyticsConsent() {
  const context = useContext(AnalyticsConsentContext);
  if (!context) {
    throw new Error(
      "useAnalyticsConsent must be used within AnalyticsConsentProvider"
    );
  }
  return context;
}

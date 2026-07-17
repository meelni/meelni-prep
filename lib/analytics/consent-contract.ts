export const ANALYTICS_CONSENT_POLICY_VERSION = 1 as const;
export const ANALYTICS_CONSENT_COOKIE = "__Host-meelni_analytics_consent";
export const ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const ANONYMOUS_CONSENT_SUBJECT = "anonymous";

export type AnalyticsConsentDecision = "undecided" | "accepted" | "declined";

export type AnalyticsConsentSource =
  | "banner"
  | "settings"
  | "legacy_decline"
  | "account_sync";

export type AnalyticsConsentScope = "anonymous" | "account";

export type AnalyticsConsentSnapshot =
  | {
      decision: "undecided";
      policyVersion: null;
      source: null;
      decidedAt: null;
      scope: null;
    }
  | AnalyticsConsentDecisionSnapshot;

export interface AnalyticsConsentDecisionSnapshot {
  decision: "accepted" | "declined";
  policyVersion: number;
  source: AnalyticsConsentSource;
  decidedAt: string;
  scope: AnalyticsConsentScope;
}

export const UNDECIDED_ANALYTICS_CONSENT: AnalyticsConsentSnapshot = {
  decision: "undecided",
  policyVersion: null,
  source: null,
  decidedAt: null,
  scope: null,
};

const DECIDED_SOURCES = new Set<AnalyticsConsentSource>([
  "banner",
  "settings",
  "legacy_decline",
  "account_sync",
]);

export function isCurrentAnalyticsAcceptance(
  consent: AnalyticsConsentSnapshot
): boolean {
  return (
    consent.decision === "accepted" &&
    consent.policyVersion === ANALYTICS_CONSENT_POLICY_VERSION &&
    isValidDecisionDate(consent.decidedAt)
  );
}

export function effectiveAnalyticsDecision(
  consent: AnalyticsConsentSnapshot | null | undefined
): AnalyticsConsentDecision {
  if (!consent) return "undecided";
  if (
    consent.decision === "declined" &&
    isValidDecisionDate(consent.decidedAt)
  ) {
    return "declined";
  }
  return isCurrentAnalyticsAcceptance(consent) ? "accepted" : "undecided";
}

export function analyticsConsentSubjectKey(
  isLoading: boolean,
  userId: string | null | undefined
): string | null {
  return isLoading ? null : (userId ?? ANONYMOUS_CONSENT_SUBJECT);
}

export function isConsentResolvedForSubject(
  currentSubject: string | null,
  resolvedSubject: string | null
): boolean {
  return currentSubject !== null && currentSubject === resolvedSubject;
}

export function shouldApplyConsentResponse(
  responseSequence: number,
  currentSequence: number,
  responseSubject: string,
  currentSubject: string | null
): boolean {
  return (
    responseSequence === currentSequence && responseSubject === currentSubject
  );
}

export function serializeAnalyticsConsentCookie(
  consent: AnalyticsConsentSnapshot
): string | null {
  if (
    consent.decision === "undecided" ||
    !consent.policyVersion ||
    !consent.source ||
    !consent.scope ||
    !DECIDED_SOURCES.has(consent.source) ||
    !isValidDecisionDate(consent.decidedAt)
  ) {
    return null;
  }

  return [
    `v${consent.policyVersion}`,
    consent.decision,
    String(new Date(consent.decidedAt!).getTime()),
    consent.source,
    consent.scope,
  ].join(".");
}

export function parseAnalyticsConsentCookie(
  value: string | null | undefined
): AnalyticsConsentSnapshot {
  if (!value) return UNDECIDED_ANALYTICS_CONSENT;
  const match =
    /^v(\d+)\.(accepted|declined)\.(\d{13})\.([a-z_]+)\.(anonymous|account)$/.exec(
      value
    );
  if (!match) return UNDECIDED_ANALYTICS_CONSENT;

  const policyVersion = Number(match[1]);
  const decision = match[2] as "accepted" | "declined";
  const decidedAt = new Date(Number(match[3])).toISOString();
  const source = match[4] as AnalyticsConsentSource;
  const scope = match[5] as AnalyticsConsentScope;
  if (
    !Number.isSafeInteger(policyVersion) ||
    policyVersion < 1 ||
    !DECIDED_SOURCES.has(source) ||
    !isValidDecisionDate(decidedAt)
  ) {
    return UNDECIDED_ANALYTICS_CONSENT;
  }

  return { decision, policyVersion, source, decidedAt, scope };
}

export function resolveTrustedAnalyticsConsent(
  browser: AnalyticsConsentSnapshot,
  account: AnalyticsConsentSnapshot,
  subject: "anonymous" | "account"
): AnalyticsConsentSnapshot {
  if (subject === "account") {
    const effectiveAccount = normalizeEffective(account);
    if (
      browser.scope !== "account" ||
      effectiveAnalyticsDecision(browser) !== "declined"
    ) {
      return effectiveAccount;
    }
    if (effectiveAnalyticsDecision(effectiveAccount) === "undecided") {
      return browser;
    }
    const browserTime = new Date(browser.decidedAt!).getTime();
    const accountTime = new Date(effectiveAccount.decidedAt!).getTime();
    return browserTime >= accountTime ? browser : effectiveAccount;
  }
  return browser.scope === "anonymous"
    ? normalizeEffective(browser)
    : UNDECIDED_ANALYTICS_CONSENT;
}

export function createAnalyticsConsentDecision(
  decision: "accepted" | "declined",
  source: AnalyticsConsentSource,
  scope: AnalyticsConsentScope,
  now = new Date()
): AnalyticsConsentDecisionSnapshot {
  return {
    decision,
    policyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
    source,
    decidedAt: now.toISOString(),
    scope,
  };
}

function normalizeEffective(
  consent: AnalyticsConsentSnapshot
): AnalyticsConsentSnapshot {
  return effectiveAnalyticsDecision(consent) === "undecided"
    ? UNDECIDED_ANALYTICS_CONSENT
    : consent;
}

function isValidDecisionDate(value: string | null): value is string {
  return value !== null && Number.isFinite(new Date(value).getTime());
}

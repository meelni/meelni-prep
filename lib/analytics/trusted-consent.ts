import { isAuthSessionMissingError, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

import {
  ANALYTICS_CONSENT_COOKIE,
  UNDECIDED_ANALYTICS_CONSENT,
  ANONYMOUS_CONSENT_SUBJECT,
  parseAnalyticsConsentCookie,
  resolveTrustedAnalyticsConsent,
  shouldRetryAccountConsentSync,
  type AnalyticsConsentSnapshot,
} from "@/lib/analytics/consent-contract";
import { createAnalyticsPseudonym } from "@/lib/analytics/pseudonym";
import { readUserAnalyticsConsent } from "@/lib/db/analytics-consent";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { createClient } from "@/lib/supabase/server";

export interface TrustedAnalyticsConsentState {
  accountSyncPending: boolean;
  accountSynchronized: boolean;
  analyticsPseudonym: string | null;
  consent: AnalyticsConsentSnapshot;
  resolved: boolean;
  subjectKey: string | null;
  user: User | null;
}

export interface AnalyticsConsentSubject {
  resolved: boolean;
  user: User | null;
}

export async function resolveAnalyticsConsentSubject(): Promise<AnalyticsConsentSubject> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error && !isAuthSessionMissingError(error)) throw error;
    return { resolved: true, user: data.user };
  } catch (error) {
    console.error("[AnalyticsConsent] Auth subject resolution failed", {
      ...toSafeErrorLog(error),
    });
    return { resolved: false, user: null };
  }
}

export async function resolveTrustedAnalyticsConsentState(
  browserCookieValue?: string | null
): Promise<TrustedAnalyticsConsentState> {
  try {
    const subject = await resolveAnalyticsConsentSubject();
    if (!subject.resolved) throw new Error("analytics_subject_unresolved");
    const user = subject.user;

    if (!user) {
      const browser = parseAnalyticsConsentCookie(browserCookieValue);
      return {
        accountSyncPending: false,
        accountSynchronized: false,
        analyticsPseudonym: null,
        consent: resolveTrustedAnalyticsConsent(
          browser,
          UNDECIDED_ANALYTICS_CONSENT,
          "anonymous"
        ),
        resolved: true,
        subjectKey: ANONYMOUS_CONSENT_SUBJECT,
        user: null,
      };
    }

    const account = await readUserAnalyticsConsent(user.id);
    const browser = parseAnalyticsConsentCookie(browserCookieValue);
    const consent = resolveTrustedAnalyticsConsent(browser, account, "account");
    const accountSynchronized =
      consent.decision === account.decision &&
      consent.decidedAt === account.decidedAt;
    return {
      accountSyncPending: shouldRetryAccountConsentSync(
        consent,
        accountSynchronized
      ),
      accountSynchronized,
      analyticsPseudonym: createAnalyticsPseudonym(user.id),
      consent,
      resolved: true,
      subjectKey: user.id,
      user,
    };
  } catch (error) {
    console.error("[AnalyticsConsent] Trusted consent resolution failed", {
      ...toSafeErrorLog(error),
    });
    return {
      accountSyncPending: false,
      accountSynchronized: false,
      analyticsPseudonym: null,
      consent: UNDECIDED_ANALYTICS_CONSENT,
      resolved: false,
      subjectKey: null,
      user: null,
    };
  }
}

export const getTrustedServerAnalyticsConsentState = cache(async () => {
  const cookieStore = await cookies();
  return resolveTrustedAnalyticsConsentState(
    cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value
  );
});

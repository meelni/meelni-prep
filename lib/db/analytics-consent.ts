import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type {
  AnalyticsConsentDecisionSnapshot,
  AnalyticsConsentSnapshot,
} from "@/lib/analytics/consent-contract";
import { UNDECIDED_ANALYTICS_CONSENT } from "@/lib/analytics/consent-contract";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";

export async function readUserAnalyticsConsent(
  userId: string
): Promise<AnalyticsConsentSnapshot> {
  const rows = await db
    .select({
      decision: userSettings.analyticsConsent,
      policyVersion: userSettings.analyticsConsentVersion,
      source: userSettings.analyticsConsentSource,
      decidedAt: userSettings.analyticsConsentUpdatedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const row = rows[0];
  return toAnalyticsConsentSnapshot(row);
}

export async function writeUserAnalyticsConsent(
  userId: string,
  consent: AnalyticsConsentDecisionSnapshot
): Promise<AnalyticsConsentDecisionSnapshot> {
  const decidedAt = new Date(consent.decidedAt);
  const values = {
    userId,
    analyticsConsent: consent.decision,
    analyticsConsentVersion: consent.policyVersion,
    analyticsConsentSource: consent.source,
    analyticsConsentUpdatedAt: decidedAt,
    shareAnonymousData: false,
    updatedAt: decidedAt,
  };
  const rows = await db
    .insert(userSettings)
    .values(values)
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: values,
      setWhere: sql`
        ${userSettings.analyticsConsentUpdatedAt} IS NULL
        OR excluded.analytics_consent_updated_at > ${userSettings.analyticsConsentUpdatedAt}
        OR (
          excluded.analytics_consent_updated_at = ${userSettings.analyticsConsentUpdatedAt}
          AND excluded.analytics_consent = 'declined'
          AND ${userSettings.analyticsConsent} <> 'declined'
        )
      `,
    })
    .returning({
      decision: userSettings.analyticsConsent,
      policyVersion: userSettings.analyticsConsentVersion,
      source: userSettings.analyticsConsentSource,
      decidedAt: userSettings.analyticsConsentUpdatedAt,
    });
  const row = rows[0];
  const persisted = row
    ? toAnalyticsConsentSnapshot(row)
    : await readUserAnalyticsConsent(userId);
  if (persisted.decision === "undecided") {
    throw new Error("analytics_consent_write_not_persisted");
  }
  return persisted;
}

function toAnalyticsConsentSnapshot(
  row:
    | {
        decision: string;
        policyVersion: number | null;
        source: string | null;
        decidedAt: Date | null;
      }
    | undefined
): AnalyticsConsentSnapshot {
  if (
    !row ||
    (row.decision !== "accepted" && row.decision !== "declined") ||
    !row.policyVersion ||
    !row.source ||
    !row.decidedAt
  ) {
    return UNDECIDED_ANALYTICS_CONSENT;
  }

  return {
    decision: row.decision,
    policyVersion: row.policyVersion,
    source: row.source as AnalyticsConsentDecisionSnapshot["source"],
    decidedAt: row.decidedAt.toISOString(),
    scope: "account",
  };
}

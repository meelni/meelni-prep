import { and, eq, gte, sql } from "drizzle-orm";

import type {
  AnalyticsConsentDecisionSnapshot,
  AnalyticsConsentSnapshot,
} from "@/lib/analytics/consent-contract";
import { UNDECIDED_ANALYTICS_CONSENT } from "@/lib/analytics/consent-contract";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";

export interface UserAnalyticsConsentRecord {
  consent: AnalyticsConsentSnapshot;
  revision: number;
}

export type UserAnalyticsConsentWriteResult = UserAnalyticsConsentRecord &
  ({ status: "applied" } | { status: "conflict" });

export async function readUserAnalyticsConsent(
  userId: string
): Promise<AnalyticsConsentSnapshot> {
  return (await readUserAnalyticsConsentRecord(userId)).consent;
}

export async function readUserAnalyticsConsentRecord(
  userId: string
): Promise<UserAnalyticsConsentRecord> {
  const rows = await db
    .select({
      decision: userSettings.analyticsConsent,
      policyVersion: userSettings.analyticsConsentVersion,
      source: userSettings.analyticsConsentSource,
      decidedAt: userSettings.analyticsConsentUpdatedAt,
      revision: userSettings.analyticsConsentRevision,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const row = rows[0];
  return toAnalyticsConsentRecord(row);
}

export async function writeUserAnalyticsConsent(
  userId: string,
  consent: AnalyticsConsentDecisionSnapshot,
  expectedRevision: number
): Promise<UserAnalyticsConsentWriteResult> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("analytics_consent_revision_invalid");
  }
  const decisionValues = {
    analyticsConsent: consent.decision,
    analyticsConsentVersion: consent.policyVersion,
    analyticsConsentSource: consent.source,
    analyticsConsentUpdatedAt: sql`clock_timestamp()`,
    shareAnonymousData: false,
    updatedAt: sql`clock_timestamp()`,
  };
  const rows = await db
    .update(userSettings)
    .set({
      ...decisionValues,
      analyticsConsentRevision: sql`${userSettings.analyticsConsentRevision} + 1`,
    })
    .where(
      and(
        eq(userSettings.userId, userId),
        consent.decision === "declined"
          ? gte(userSettings.analyticsConsentRevision, expectedRevision)
          : eq(userSettings.analyticsConsentRevision, expectedRevision)
      )
    )
    .returning({
      decision: userSettings.analyticsConsent,
      policyVersion: userSettings.analyticsConsentVersion,
      source: userSettings.analyticsConsentSource,
      decidedAt: userSettings.analyticsConsentUpdatedAt,
      revision: userSettings.analyticsConsentRevision,
    });

  if (rows[0]) {
    return { ...toAnalyticsConsentRecord(rows[0]), status: "applied" };
  }

  if (expectedRevision === 0) {
    const inserted = await db
      .insert(userSettings)
      .values({
        userId,
        ...decisionValues,
        analyticsConsentRevision: 1,
      })
      .onConflictDoNothing({ target: userSettings.userId })
      .returning({
        decision: userSettings.analyticsConsent,
        policyVersion: userSettings.analyticsConsentVersion,
        source: userSettings.analyticsConsentSource,
        decidedAt: userSettings.analyticsConsentUpdatedAt,
        revision: userSettings.analyticsConsentRevision,
      });
    if (inserted[0]) {
      return { ...toAnalyticsConsentRecord(inserted[0]), status: "applied" };
    }

    // A first acceptance can create the settings row after the withdrawal's
    // initial UPDATE but before its INSERT. Retry the withdrawal against the
    // now-existing row so opt-out remains dominant across that race.
    if (consent.decision === "declined") {
      const withdrawn = await db
        .update(userSettings)
        .set({
          ...decisionValues,
          analyticsConsentRevision: sql`${userSettings.analyticsConsentRevision} + 1`,
        })
        .where(
          and(
            eq(userSettings.userId, userId),
            gte(userSettings.analyticsConsentRevision, expectedRevision)
          )
        )
        .returning({
          decision: userSettings.analyticsConsent,
          policyVersion: userSettings.analyticsConsentVersion,
          source: userSettings.analyticsConsentSource,
          decidedAt: userSettings.analyticsConsentUpdatedAt,
          revision: userSettings.analyticsConsentRevision,
        });
      if (withdrawn[0]) {
        return { ...toAnalyticsConsentRecord(withdrawn[0]), status: "applied" };
      }
    }
  }

  const persisted = await readUserAnalyticsConsentRecord(userId);
  if (persisted.consent.decision === "undecided") {
    throw new Error("analytics_consent_write_not_persisted");
  }
  return { ...persisted, status: "conflict" };
}

function toAnalyticsConsentRecord(
  row:
    | {
        decision: string;
        policyVersion: number | null;
        source: string | null;
        decidedAt: Date | null;
        revision: number;
      }
    | undefined
): UserAnalyticsConsentRecord {
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    return { consent: UNDECIDED_ANALYTICS_CONSENT, revision: 0 };
  }
  return {
    consent: toAnalyticsConsentSnapshot(row),
    revision: row.revision,
  };
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

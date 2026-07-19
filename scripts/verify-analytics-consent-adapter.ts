import assert from "node:assert/strict";

import postgres from "postgres";

import { createAnalyticsConsentDecision } from "../lib/analytics/consent-contract";
import { writeUserAnalyticsConsent } from "../lib/db/analytics-consent";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const userId = "19191919-1919-4919-8919-191919191919";
const sql = postgres(databaseUrl, { max: 1, prepare: false });

void run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function run() {
  try {
    await sql`DELETE FROM user_settings WHERE user_id = ${userId}::uuid`;
    await sql`DELETE FROM app_user WHERE id = ${userId}::uuid`;
    await sql`
      INSERT INTO app_user (id, email)
      VALUES (${userId}::uuid, 'analytics-adapter-test@meelni.invalid')
    `;

    const acceptance = createAnalyticsConsentDecision(
      "accepted",
      "settings",
      "account"
    );
    const duplicateAcceptance = await Promise.all([
      writeUserAnalyticsConsent(userId, acceptance, 0),
      writeUserAnalyticsConsent(userId, acceptance, 0),
    ]);
    assert.deepEqual(
      duplicateAcceptance.map((result) => result.status).sort(),
      ["applied", "conflict"]
    );

    await sql`DELETE FROM user_settings WHERE user_id = ${userId}::uuid`;
    const withdrawal = createAnalyticsConsentDecision(
      "declined",
      "settings",
      "account"
    );
    const [firstAcceptance, firstWithdrawal] = await Promise.all([
      writeUserAnalyticsConsent(userId, acceptance, 0),
      writeUserAnalyticsConsent(userId, withdrawal, 0),
    ]);
    assert.equal(firstAcceptance.status, "applied");
    assert.equal(firstWithdrawal.status, "applied");

    const [winner] = await sql<
      { analytics_consent: string; analytics_consent_revision: number }[]
    >`
      SELECT analytics_consent,
        analytics_consent_revision::int AS analytics_consent_revision
      FROM user_settings
      WHERE user_id = ${userId}::uuid
    `;
    assert.deepEqual(winner, {
      analytics_consent: "declined",
      analytics_consent_revision: 2,
    });

    const freshAcceptance = await writeUserAnalyticsConsent(
      userId,
      acceptance,
      2
    );
    assert.equal(freshAcceptance.status, "applied");
    assert.equal(freshAcceptance.consent.decision, "accepted");
    assert.equal(freshAcceptance.revision, 3);
  } finally {
    await sql`DELETE FROM user_settings WHERE user_id = ${userId}::uuid`;
    await sql`DELETE FROM app_user WHERE id = ${userId}::uuid`;
    await sql.end();
  }
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  UNDECIDED_ANALYTICS_CONSENT,
  createAnalyticsConsentDecision,
  effectiveAnalyticsDecision,
  analyticsConsentSubjectKey,
  isConsentResolvedForSubject,
  shouldApplyConsentResponse,
  shouldRetryAccountConsentSync,
  parseAnalyticsConsentCookie,
  resolveTrustedAnalyticsConsent,
  serializeAnalyticsConsentCookie,
} from "./consent-contract";

test("analytics consent fails closed for missing and malformed cookies", () => {
  assert.deepEqual(
    parseAnalyticsConsentCookie(null),
    UNDECIDED_ANALYTICS_CONSENT
  );
  assert.deepEqual(
    parseAnalyticsConsentCookie("v1.accepted.not-a-time.banner"),
    UNDECIDED_ANALYTICS_CONSENT
  );
});

test("auth subject changes synchronously invalidate resolved consent", () => {
  const userA = analyticsConsentSubjectKey(false, "user-a");
  const userB = analyticsConsentSubjectKey(false, "user-b");
  assert.equal(isConsentResolvedForSubject(userA, userA), true);
  assert.equal(isConsentResolvedForSubject(userB, userA), false);
  assert.equal(isConsentResolvedForSubject(null, userA), false);
});

test("stale GET and PUT responses cannot replace a newer choice or subject", () => {
  assert.equal(shouldApplyConsentResponse(1, 2, "user-a", "user-a"), false);
  assert.equal(shouldApplyConsentResponse(2, 2, "user-a", "user-b"), false);
  assert.equal(shouldApplyConsentResponse(2, 2, "user-b", "user-b"), true);
});

test("only a real unsynchronized account choice exposes retry state", () => {
  const declined = createAnalyticsConsentDecision(
    "declined",
    "settings",
    "account",
    new Date("2026-07-10T12:00:00.000Z")
  );
  const legacyDecline = createAnalyticsConsentDecision(
    "declined",
    "legacy_decline",
    "account",
    new Date("2026-07-10T12:00:00.000Z")
  );

  assert.equal(shouldRetryAccountConsentSync(declined, false), true);
  assert.equal(shouldRetryAccountConsentSync(declined, true), false);
  assert.equal(shouldRetryAccountConsentSync(legacyDecline, false), false);
  assert.equal(
    shouldRetryAccountConsentSync(UNDECIDED_ANALYTICS_CONSENT, false),
    false
  );
});

test("analytics consent cookie round-trips a current explicit decision", () => {
  const consent = createAnalyticsConsentDecision(
    "accepted",
    "banner",
    "anonymous",
    new Date("2026-07-10T12:00:00.000Z")
  );
  assert.deepEqual(
    parseAnalyticsConsentCookie(serializeAnalyticsConsentCookie(consent)),
    consent
  );
});

test("an old acceptance re-prompts while an old decline remains effective", () => {
  const accepted = parseAnalyticsConsentCookie(
    "v2.accepted.1783684800000.banner.anonymous"
  );
  const declined = parseAnalyticsConsentCookie(
    "v2.declined.1783684800000.banner.anonymous"
  );
  assert.equal(effectiveAnalyticsDecision(accepted), "undecided");
  assert.equal(effectiveAnalyticsDecision(declined), "declined");
});

test("anonymous consent cannot promote or overwrite account consent", () => {
  const anonymousAccepted = createAnalyticsConsentDecision(
    "accepted",
    "banner",
    "anonymous",
    new Date("2026-07-10T12:00:00.000Z")
  );
  const accountDeclined = createAnalyticsConsentDecision(
    "declined",
    "settings",
    "account",
    new Date("2026-07-10T12:01:00.000Z")
  );
  assert.equal(
    resolveTrustedAnalyticsConsent(
      anonymousAccepted,
      accountDeclined,
      "account"
    ).decision,
    "declined"
  );
  assert.equal(
    resolveTrustedAnalyticsConsent(
      anonymousAccepted,
      UNDECIDED_ANALYTICS_CONSENT,
      "account"
    ).decision,
    "undecided"
  );
});

test("account-scoped cookies are ignored after sign-out", () => {
  const accountAccepted = createAnalyticsConsentDecision(
    "accepted",
    "settings",
    "account",
    new Date("2026-07-10T12:00:00.000Z")
  );
  assert.equal(
    resolveTrustedAnalyticsConsent(
      accountAccepted,
      UNDECIDED_ANALYTICS_CONSENT,
      "anonymous"
    ).decision,
    "undecided"
  );
});

test("a stale browser acceptance cannot overwrite a newer account decline", () => {
  const browserAccepted = createAnalyticsConsentDecision(
    "accepted",
    "settings",
    "account",
    new Date("2026-07-10T12:00:00.000Z")
  );
  const accountDeclined = createAnalyticsConsentDecision(
    "declined",
    "settings",
    "account",
    new Date("2026-07-10T12:01:00.000Z")
  );
  assert.equal(
    resolveTrustedAnalyticsConsent(browserAccepted, accountDeclined, "account")
      .decision,
    "declined"
  );
});

test("a newer local withdrawal fails closed over stale account acceptance", () => {
  const accountAccepted = createAnalyticsConsentDecision(
    "accepted",
    "settings",
    "account",
    new Date("2026-07-10T12:00:00.000Z")
  );
  const browserDeclined = createAnalyticsConsentDecision(
    "declined",
    "settings",
    "account",
    new Date("2026-07-10T12:01:00.000Z")
  );
  assert.equal(
    resolveTrustedAnalyticsConsent(browserDeclined, accountAccepted, "account")
      .decision,
    "declined"
  );
});

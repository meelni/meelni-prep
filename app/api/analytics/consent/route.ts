import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS,
  ANALYTICS_CONSENT_POLICY_VERSION,
  createAnalyticsConsentDecision,
  serializeAnalyticsConsentCookie,
  type AnalyticsConsentSnapshot,
} from "@/lib/analytics/consent-contract";
import { createAnalyticsPseudonym } from "@/lib/analytics/pseudonym";
import {
  resolveAnalyticsConsentSubject,
  resolveTrustedAnalyticsConsentState,
} from "@/lib/analytics/trusted-consent";
import { writeUserAnalyticsConsent } from "@/lib/db/analytics-consent";
import { getAnalyticsConsentRequestPolicyError } from "@/lib/security/analytics-consent-request-policy";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

const writeSchema = z
  .object({
    decision: z.enum(["accepted", "declined"]),
    expectedRevision: z.number().int().nonnegative().optional(),
    policyVersion: z.number().int().positive(),
    source: z.enum(["banner", "settings", "legacy_decline"]),
  })
  .strict()
  .refine(
    ({ decision, source }) =>
      source !== "legacy_decline" || decision === "declined",
    { message: "Legacy consent can only preserve a decline." }
  );

export async function GET(request: NextRequest) {
  const state = await resolveTrustedAnalyticsConsentState(
    request.cookies.get(ANALYTICS_CONSENT_COOKIE)?.value
  );
  if (!state.resolved) {
    return json({ error: "consent_persistence_failed" }, 503);
  }
  const browserOnly =
    state.consent.source === "legacy_decline" && !state.accountSynchronized;
  const response = json({
    analyticsPseudonym:
      state.consent.decision === "accepted" ? state.analyticsPseudonym : null,
    consent: state.consent,
    currentPolicyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
    persistence: {
      browser: state.consent.decision !== "undecided",
      account: state.accountSynchronized,
      accountRevision: state.accountRevision,
      browserOnly,
    },
  });
  setConsentCookie(response, state.consent);
  return response;
}

export async function PUT(request: NextRequest) {
  const policyError = getAnalyticsConsentRequestPolicyError(request);
  if (policyError)
    return json({ error: policyError.error }, policyError.status);

  const parsed = writeSchema.safeParse(await safeJson(request));
  if (!parsed.success) return json({ error: "invalid_consent_request" }, 400);
  if (parsed.data.policyVersion !== ANALYTICS_CONSENT_POLICY_VERSION) {
    return json(
      {
        error: "consent_policy_outdated",
        currentPolicyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
      },
      409
    );
  }

  const subject = await resolveAnalyticsConsentSubject();
  if (!subject.resolved) {
    return json({ error: "consent_persistence_failed" }, 503);
  }
  const requestedConsent = createAnalyticsConsentDecision(
    parsed.data.decision,
    parsed.data.source,
    subject.user ? "account" : "anonymous"
  );
  let consent: AnalyticsConsentSnapshot = requestedConsent;
  let accountPersisted = false;
  let accountRevision: number | null = null;
  const browserOnly = parsed.data.source === "legacy_decline";
  try {
    if (subject.user && !browserOnly) {
      if (parsed.data.expectedRevision === undefined) {
        return json({ error: "consent_revision_required" }, 400);
      }
      const result = await writeUserAnalyticsConsent(
        subject.user.id,
        requestedConsent,
        parsed.data.expectedRevision
      );
      consent = result.consent;
      accountRevision = result.revision;
      accountPersisted = true;
      if (result.status === "conflict") {
        const response = json(
          {
            error: "consent_conflict",
            analyticsPseudonym:
              consent.decision === "accepted"
                ? createAnalyticsPseudonym(subject.user.id)
                : null,
            consent,
            currentPolicyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
            persistence: {
              browser: true,
              account: true,
              accountRevision,
              browserOnly: false,
            },
          },
          409
        );
        setConsentCookie(response, consent);
        return response;
      }
    }
  } catch (error) {
    console.error("[AnalyticsConsent] Failed to persist account consent", {
      ...toSafeErrorLog(error),
    });
    if (consent.decision === "accepted") {
      return json({ error: "consent_persistence_failed" }, 503);
    }
  }

  const response = json({
    analyticsPseudonym:
      consent.decision === "accepted" && subject.user
        ? createAnalyticsPseudonym(subject.user.id)
        : null,
    consent,
    currentPolicyVersion: ANALYTICS_CONSENT_POLICY_VERSION,
    persistence: {
      browser: true,
      account: accountPersisted,
      accountRevision,
      browserOnly,
    },
  });
  setConsentCookie(response, consent);
  return response;
}

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function setConsentCookie(
  response: NextResponse,
  consent: AnalyticsConsentSnapshot
): void {
  const value = serializeAnalyticsConsentCookie(consent);
  if (!value) {
    response.cookies.delete(ANALYTICS_CONSENT_COOKIE);
    return;
  }
  response.cookies.set(ANALYTICS_CONSENT_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS,
  });
}

function json(body: object, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

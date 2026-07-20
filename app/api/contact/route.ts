import { NextRequest, NextResponse } from "next/server";

import {
  contactIdempotencyKeySchema,
  contactSubmissionSchema,
  type ContactSubmissionError,
  type ContactSubmissionResponse,
} from "@/lib/contact/contracts";
import { resolveAuthenticatedContactUserId } from "@/lib/contact/authenticated-submitter";
import {
  consumeContactSubmissionAttemptBudget,
  createDrizzleContactSubmissionStore,
} from "@/lib/db/contact-submissions";
import {
  createContactAttemptRateLimitIdentity,
  createContactRateLimitIdentities,
} from "@/lib/security/contact-rate-limit-identity";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { submitContactRequest } from "@/lib/workflows/submit-contact-request";

const MAX_CONTACT_REQUEST_BYTES = 32 * 1024;

class ContactRequestTooLarge extends Error {}

export async function POST(req: NextRequest) {
  try {
    const gateName = FEATURE_GATES.meelniReactivationAccess;
    const access = await resolveReactivationAccess({
      localOverride: req.cookies.get(
        `meelni_feature_flag_${encodeURIComponent(gateName)}`
      )?.value,
    });
    if (!access.value) {
      return contactError(
        "contact_unavailable",
        "The contact form is temporarily unavailable. Email support@meelni.com or manage account and billing settings from your dashboard.",
        false,
        403
      );
    }
  } catch {
    reportOperationalFailure({
      operation: "contact_submission",
      errorCode: "contact_submission_access_check_failed",
      severity: "error",
      retryable: true,
    });
    return contactError(
      "storage_unavailable",
      "We could not save your request. Try again or email support@meelni.com directly.",
      true,
      503
    );
  }

  let attemptIdentity: string;
  try {
    attemptIdentity = createContactAttemptRateLimitIdentity(req.headers);
  } catch {
    reportOperationalFailure({
      operation: "contact_submission",
      errorCode: "contact_submission_security_configuration_failed",
      severity: "critical",
      retryable: false,
    });
    return contactError(
      "storage_unavailable",
      "We could not save your request. Try again or email support@meelni.com directly.",
      true,
      503
    );
  }

  let attemptDecision;
  try {
    attemptDecision =
      await consumeContactSubmissionAttemptBudget(attemptIdentity);
  } catch {
    reportOperationalFailure({
      operation: "contact_submission",
      errorCode: "contact_submission_attempt_budget_failed",
      severity: "error",
      retryable: true,
    });
    return contactError(
      "storage_unavailable",
      "We could not save your request. Try again or email support@meelni.com directly.",
      true,
      503
    );
  }

  if (!attemptDecision.allowed) {
    return contactError(
      "rate_limited",
      "Too many requests were submitted. Wait a little, then try again or email us directly.",
      true,
      429,
      attemptDecision.retryAfterSeconds
    );
  }

  if (
    req.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return contactError(
      "invalid_request",
      "Submit the form as JSON and try again.",
      false,
      415
    );
  }

  const idempotencyKey = contactIdempotencyKeySchema.safeParse(
    req.headers.get("Idempotency-Key")
  );
  if (!idempotencyKey.success) {
    return contactError(
      "invalid_idempotency_key",
      "Refresh the page and try again.",
      false,
      400
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req);
  } catch (error) {
    if (error instanceof ContactRequestTooLarge) {
      return contactError(
        "invalid_request",
        "The request is too large. Shorten the message and try again.",
        false,
        413
      );
    }
    return contactError(
      "invalid_request",
      "Enter your contact details and message, then try again.",
      false,
      400
    );
  }

  const parsed = contactSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return contactError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
      false,
      400
    );
  }

  let rateLimitIdentities;
  try {
    rateLimitIdentities = createContactRateLimitIdentities(
      req.headers,
      parsed.data.email
    );
  } catch {
    reportOperationalFailure({
      operation: "contact_submission",
      errorCode: "contact_submission_security_configuration_failed",
      severity: "critical",
      retryable: false,
    });
    return contactError(
      "storage_unavailable",
      "We could not save your request. Try again or email support@meelni.com directly.",
      true,
      503
    );
  }

  let userId: string | null;
  try {
    userId = await resolveAuthenticatedContactUserId(parsed.data.email);
  } catch {
    reportOperationalFailure({
      operation: "contact_submission",
      errorCode: "contact_submission_auth_link_failed",
      severity: "error",
      retryable: true,
    });
    return contactError(
      "storage_unavailable",
      "We could not save your request. Try again or email support@meelni.com directly.",
      true,
      503
    );
  }

  const result = await submitContactRequest(
    {
      idempotencyKey: idempotencyKey.data,
      userId,
      ...parsed.data,
      rateLimitIdentities,
    },
    createDrizzleContactSubmissionStore()
  );

  if (result.ok) {
    return NextResponse.json<ContactSubmissionResponse>(result, {
      status: result.duplicate ? 200 : 202,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (result.code === "idempotency_conflict") {
    return contactError(
      result.code,
      "The form changed while it was being saved. Review it and submit again.",
      false,
      409
    );
  }

  if (result.code === "rate_limited") {
    const retryAfterSeconds = result.retryAfterSeconds ?? 60;
    return contactError(
      result.code,
      "Too many requests were submitted. Wait a little, then try again or email us directly.",
      true,
      429,
      retryAfterSeconds
    );
  }

  reportOperationalFailure({
    operation: "contact_submission",
    errorCode: "contact_submission_storage_failed",
    severity: "error",
    retryable: true,
  });
  return contactError(
    result.code,
    "We could not save your request. Try again or email support@meelni.com directly.",
    true,
    503
  );
}

async function readBoundedJson(req: NextRequest): Promise<unknown> {
  const declaredLength = Number(req.headers.get("Content-Length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CONTACT_REQUEST_BYTES
  ) {
    throw new ContactRequestTooLarge();
  }

  if (!req.body) throw new SyntaxError("Missing request body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_CONTACT_REQUEST_BYTES) {
      await reader.cancel();
      throw new ContactRequestTooLarge();
    }
    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes)
  );
}

function contactError(
  code: ContactSubmissionError["code"],
  message: string,
  retryable: boolean,
  status: number,
  retryAfterSeconds?: number
) {
  const body: ContactSubmissionError = {
    ok: false,
    code,
    message,
    retryable,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };

  return NextResponse.json<ContactSubmissionResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfterSeconds === undefined
        ? {}
        : { "Retry-After": String(retryAfterSeconds) }),
    },
  });
}

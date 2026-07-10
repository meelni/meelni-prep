import { NextRequest, NextResponse } from "next/server";

import {
  contactIdempotencyKeySchema,
  contactSubmissionSchema,
  type ContactSubmissionError,
  type ContactSubmissionResponse,
} from "@/lib/contact/contracts";
import { createDrizzleContactSubmissionStore } from "@/lib/db/contact-submissions";
import { createContactRateLimitIdentities } from "@/lib/security/contact-rate-limit-identity";
import { submitContactRequest } from "@/lib/workflows/submit-contact-request";

const MAX_CONTACT_REQUEST_BYTES = 32 * 1024;

class ContactRequestTooLarge extends Error {}

export async function POST(req: NextRequest) {
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
    console.error("contact_submission_failed", {
      code: "security_configuration_unavailable",
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
    console.warn("contact_submission_rejected", {
      code: result.code,
    });
    return contactError(
      result.code,
      "The form changed while it was being saved. Review it and submit again.",
      false,
      409
    );
  }

  if (result.code === "rate_limited") {
    console.warn("contact_submission_rejected", {
      code: result.code,
    });
    const retryAfterSeconds = result.retryAfterSeconds ?? 60;
    return contactError(
      result.code,
      "Too many requests were submitted. Wait a little, then try again or email us directly.",
      true,
      429,
      retryAfterSeconds
    );
  }

  console.error("contact_submission_failed", {
    code: result.code,
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

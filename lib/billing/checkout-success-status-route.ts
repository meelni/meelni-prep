import { NextRequest, NextResponse } from "next/server";

import {
  checkoutError,
  isCheckoutSessionId,
  resolveCheckoutSettlement,
  type CheckoutSettlementEvidence,
  type CheckoutSuccessPublicState,
} from "./checkout-success-state";
import {
  CHECKOUT_RETURN_COOKIE_NAMES,
  checkoutReturnCorrelationFromCookie,
  checkoutReturnCookieName,
  checkoutSessionIdFromReturnCookie,
  isCheckoutReturnHandle,
} from "./checkout-return-cookie";
import type { OperationalFailureErrorCode } from "../operations/operational-events";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export interface CheckoutStatusDependencies {
  authenticate(): Promise<string | null>;
  hasDeletionTombstone(userId: string): Promise<boolean>;
  findSettlementEvidence(input: {
    userId: string;
    sessionIds: readonly string[];
  }): Promise<readonly CheckoutSettlementEvidence[]>;
  reportFailure(errorCode: CheckoutConfirmationFailureCode): void;
}

export type CheckoutConfirmationFailureCode = Extract<
  OperationalFailureErrorCode,
  | "checkout_confirmation_auth_failed"
  | "checkout_confirmation_settlement_read_failed"
>;

export async function handleCheckoutStatus(
  request: NextRequest,
  dependencies: CheckoutStatusDependencies
): Promise<NextResponse> {
  let userId: string | null;
  try {
    userId = await dependencies.authenticate();
  } catch {
    dependencies.reportFailure("checkout_confirmation_auth_failed");
    return stateResponse(checkoutError("temporarily_unavailable", true), 503);
  }
  if (!userId) {
    return stateResponse(checkoutError("not_found", false), 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return stateResponse(checkoutError("not_found", false), 400);
  }
  const submittedHandle =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).returnHandle
      : null;
  if (submittedHandle != null && !isCheckoutReturnHandle(submittedHandle)) {
    return stateResponse(checkoutError("not_found", false), 400);
  }
  const correlations = isCheckoutReturnHandle(submittedHandle)
    ? [exactCheckoutReturnCorrelation(request, submittedHandle)].filter(
        (value): value is CheckoutReturnSelection => value !== null
      )
    : checkoutReturnCorrelationsNewestFirst(request);
  if (correlations.length === 0) {
    // A deterministic slot may contain a newer Checkout's correlation. Never
    // clear or read it when the submitted handle does not match its value.
    return stateResponse(checkoutError("not_found", false), 400);
  }

  let hasDeletionTombstone: boolean;
  try {
    hasDeletionTombstone = await dependencies.hasDeletionTombstone(userId);
  } catch {
    dependencies.reportFailure("checkout_confirmation_settlement_read_failed");
    return stateResponse(checkoutError("temporarily_unavailable", true), 503);
  }
  if (hasDeletionTombstone) {
    return stateResponse(
      checkoutError("not_found", false),
      404,
      isCheckoutReturnHandle(submittedHandle)
        ? correlations.map(({ cookieName }) => cookieName)
        : CHECKOUT_RETURN_COOKIE_NAMES
    );
  }

  let evidence: readonly CheckoutSettlementEvidence[];
  try {
    evidence = await dependencies.findSettlementEvidence({
      userId,
      sessionIds: [...new Set(correlations.map(({ sessionId }) => sessionId))],
    });
  } catch {
    dependencies.reportFailure("checkout_confirmation_settlement_read_failed");
    return stateResponse(checkoutError("temporarily_unavailable", true), 503);
  }

  // Without a same-tab handle, prefer the newest correlation with durable
  // first-party truth. This prevents a later abandoned Checkout from masking
  // an older delayed payment that settled during the 30-day recovery window.
  const selectedCorrelation =
    correlations.find(({ sessionId }) =>
      evidence.some((row) => row.checkoutSessionId === sessionId)
    ) ?? correlations[0]!;
  const selectedEvidence = evidence.filter(
    (row) => row.checkoutSessionId === selectedCorrelation.sessionId
  );
  const state = resolveCheckoutSettlement({
    requestedSessionId: selectedCorrelation.sessionId,
    userId,
    evidence: selectedEvidence,
  });
  return stateResponse(
    state,
    stateHttpStatus(state),
    selectedCorrelation.cookieName
  );
}

export function resolveCheckoutStatusAuthentication(input: {
  user: { id: string } | null;
  error: unknown;
}): string | null {
  if (input.user?.id) return input.user.id;
  if (!input.error || isMissingOrExpiredAuth(input.error)) return null;
  throw input.error;
}

function stateResponse(
  state: CheckoutSuccessPublicState,
  status: number,
  selectedCookieNames?: string | readonly string[]
): NextResponse {
  const response = NextResponse.json(state, {
    status,
    headers: NO_STORE_HEADERS,
  });
  if (selectedCookieNames && isDefinitiveCheckoutState(state)) {
    const names = Array.isArray(selectedCookieNames)
      ? selectedCookieNames
      : [selectedCookieNames];
    for (const cookieName of names) {
      response.cookies.set(cookieName, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
  }
  return response;
}

function stateHttpStatus(state: CheckoutSuccessPublicState): number {
  if (state.status !== "error") return 200;
  if (state.reason === "not_found") return 404;
  if (state.reason === "temporarily_unavailable") return 503;
  return 409;
}

function isMissingOrExpiredAuth(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
  };
  if (candidate.name === "AuthSessionMissingError") return true;
  if (
    candidate.code === "session_not_found" ||
    candidate.code === "bad_jwt" ||
    candidate.code === "jwt_expired"
  ) {
    return true;
  }
  return candidate.status === 401 || candidate.status === 403;
}

function isDefinitiveCheckoutState(state: CheckoutSuccessPublicState): boolean {
  return (
    state.status === "confirmed" ||
    (state.status === "error" && !state.retryable)
  );
}

function exactCheckoutReturnCorrelation(
  request: NextRequest,
  handle: string
): CheckoutReturnSelection | null {
  const cookieName = checkoutReturnCookieName(handle);
  if (!cookieName) return null;
  const sessionId = checkoutSessionIdFromReturnCookie(
    request.cookies.get(cookieName)?.value ?? null,
    handle
  );
  return isCheckoutSessionId(sessionId) ? { cookieName, sessionId } : null;
}

interface CheckoutReturnSelection {
  cookieName: string;
  sessionId: string;
}

function checkoutReturnCorrelationsNewestFirst(
  request: NextRequest
): CheckoutReturnSelection[] {
  return CHECKOUT_RETURN_COOKIE_NAMES.flatMap((cookieName) => {
    const correlation = checkoutReturnCorrelationFromCookie(
      request.cookies.get(cookieName)?.value ?? null
    );
    return correlation && isCheckoutSessionId(correlation.sessionId)
      ? [{ cookieName, ...correlation }]
      : [];
  })
    .sort(
      (left, right) =>
        right.createdAtMs - left.createdAtMs ||
        left.cookieName.localeCompare(right.cookieName)
    )
    .map(({ cookieName, sessionId }) => ({ cookieName, sessionId }));
}

import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  handleCheckoutStatus,
  resolveCheckoutStatusAuthentication,
  type CheckoutStatusDependencies,
} from "./checkout-success-status-route";
import {
  CHECKOUT_RETURN_COOKIE_NAMES,
  checkoutReturnCookieName,
  checkoutReturnCookieSlot,
  encodeCheckoutReturnCookie,
} from "./checkout-return-cookie";
import type { CheckoutSettlementEvidence } from "./checkout-success-state";

const SESSION_ID = "cs_test_status_route_123";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const RETURN_HANDLE = "cr_0123456789abcdef0123456789abcdef";
const OTHER_HANDLE = "cr_00000000000000000000000000000001";

test("checkout status authenticates before first-party settlement reads", async () => {
  let reads = 0;
  const response = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({
      authenticate: async () => null,
      findSettlementEvidence: async () => {
        reads += 1;
        return [];
      },
    })
  );

  assert.equal(response.status, 401);
  assert.equal(reads, 0);
});

test("missing and malformed HttpOnly correlation cookies fail before reads", async () => {
  for (const sessionId of [
    null,
    "pi_test_not_checkout",
    "{CHECKOUT_SESSION_ID}",
  ]) {
    let reads = 0;
    const response = await handleCheckoutStatus(
      request(sessionId),
      dependencies({
        findSettlementEvidence: async () => {
          reads += 1;
          return [];
        },
      })
    );
    assert.equal(response.status, 400);
    assert.equal(reads, 0);
  }
});

test("malformed opaque return handles fail before reads", async () => {
  for (const handle of ["cr_short", "cs_test_not_a_handle"]) {
    let reads = 0;
    const response = await handleCheckoutStatus(
      request(SESSION_ID, handle),
      dependencies({
        findSettlementEvidence: async () => {
          reads += 1;
          return [];
        },
      })
    );
    assert.equal(response.status, 400);
    assert.equal(reads, 0);
  }
});

test("exact authenticated settlement confirms through an owner-scoped read", async () => {
  const response = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({
      findSettlementEvidence: async ({ userId, sessionIds }) => {
        assert.equal(userId, USER_ID);
        assert.deepEqual(sessionIds, [SESSION_ID]);
        return [interviewPassEvidence()];
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0"
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await response.json(), {
    status: "confirmed",
    purchase: "interview_pass",
  });
  assert.match(
    response.headers.get("set-cookie") ?? "",
    new RegExp(`${checkoutReturnCookieName(RETURN_HANDLE)!}=;`)
  );
});

test("each return handle selects only its own Checkout Session", async () => {
  assert.notEqual(
    checkoutReturnCookieName(RETURN_HANDLE),
    checkoutReturnCookieName(OTHER_HANDLE)
  );
  const seen: string[] = [];
  const response = await handleCheckoutStatus(
    requestWithCookies(RETURN_HANDLE, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        RETURN_HANDLE,
        SESSION_ID
      )!,
      [checkoutReturnCookieName(OTHER_HANDLE)!]: encodeCheckoutReturnCookie(
        OTHER_HANDLE,
        "cs_test_other_tab_456"
      )!,
    }),
    dependencies({
      findSettlementEvidence: async ({ sessionIds }) => {
        seen.push(...sessionIds);
        return [];
      },
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [SESSION_ID]);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("a queryless revisit selects the newest valid slotted cookie", async () => {
  const seen: string[] = [];
  const response = await handleCheckoutStatus(
    requestWithCookies(null, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        RETURN_HANDLE,
        SESSION_ID,
        100
      )!,
      [checkoutReturnCookieName(OTHER_HANDLE)!]: encodeCheckoutReturnCookie(
        OTHER_HANDLE,
        "cs_test_newest_revisit_789",
        200
      )!,
    }),
    dependencies({
      findSettlementEvidence: async ({ sessionIds }) => {
        seen.push(...sessionIds);
        return [];
      },
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(seen, ["cs_test_newest_revisit_789", SESSION_ID]);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("a newer abandoned Checkout cannot mask an older settled purchase", async () => {
  const response = await handleCheckoutStatus(
    requestWithCookies(null, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        RETURN_HANDLE,
        SESSION_ID,
        100
      )!,
      [checkoutReturnCookieName(OTHER_HANDLE)!]: encodeCheckoutReturnCookie(
        OTHER_HANDLE,
        "cs_test_abandoned_newer_789",
        200
      )!,
    }),
    dependencies({
      findSettlementEvidence: async ({ sessionIds }) => {
        assert.deepEqual(sessionIds, [
          "cs_test_abandoned_newer_789",
          SESSION_ID,
        ]);
        return [interviewPassEvidence()];
      },
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "confirmed",
    purchase: "interview_pass",
  });
  assert.match(
    response.headers.get("set-cookie") ?? "",
    new RegExp(`${checkoutReturnCookieName(RETURN_HANDLE)!}=;`)
  );
});

test("a queryless revisit ignores malformed newer-looking slots", async () => {
  const seen: string[] = [];
  const malformedHandle = "cr_00000000000000000000000000000002";
  const response = await handleCheckoutStatus(
    requestWithCookies(null, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        RETURN_HANDLE,
        SESSION_ID,
        100
      )!,
      [checkoutReturnCookieName(malformedHandle)!]:
        `${malformedHandle}:not_checkout:999`,
    }),
    dependencies({
      findSettlementEvidence: async ({ sessionIds }) => {
        seen.push(...sessionIds);
        return [];
      },
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [SESSION_ID]);
});

test("a deterministic-slot collision fails closed without clearing the newer correlation", async () => {
  const collidingHandle = Array.from(
    { length: 256 },
    (_, index) => `cr_${index.toString(36).padStart(32, "0")}`
  ).find(
    (candidate) =>
      candidate !== RETURN_HANDLE &&
      checkoutReturnCookieSlot(candidate) ===
        checkoutReturnCookieSlot(RETURN_HANDLE)
  );
  assert.ok(collidingHandle);
  let reads = 0;
  const response = await handleCheckoutStatus(
    requestWithCookies(RETURN_HANDLE, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        collidingHandle,
        "cs_test_newer_collision"
      )!,
    }),
    dependencies({
      findSettlementEvidence: async () => {
        reads += 1;
        return [];
      },
    })
  );
  assert.equal(response.status, 400);
  assert.equal(reads, 0);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("no durable webhook evidence remains pending", async () => {
  const response = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({ findSettlementEvidence: async () => [] })
  );
  assert.deepEqual(await response.json(), {
    status: "pending",
    retryable: true,
  });
});

test("deleted accounts fail closed before settlement reads", async () => {
  let reads = 0;
  const response = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({
      hasDeletionTombstone: async () => true,
      findSettlementEvidence: async () => {
        reads += 1;
        return [];
      },
    })
  );
  assert.equal(response.status, 404);
  assert.equal(reads, 0);
  assert.deepEqual(
    response.cookies.getAll().map(({ name }) => name),
    [checkoutReturnCookieName(RETURN_HANDLE)]
  );
});

test("queryless deletion cleanup expires every fixed correlation slot", async () => {
  const response = await handleCheckoutStatus(
    requestWithCookies(null, {
      [checkoutReturnCookieName(RETURN_HANDLE)!]: encodeCheckoutReturnCookie(
        RETURN_HANDLE,
        SESSION_ID
      )!,
    }),
    dependencies({ hasDeletionTombstone: async () => true })
  );
  assert.equal(response.status, 404);
  assert.deepEqual(
    response.cookies
      .getAll()
      .map(({ name }) => name)
      .sort(),
    [...CHECKOUT_RETURN_COOKIE_NAMES].sort()
  );
  assert.equal(
    response.cookies.getAll().every(({ value }) => value === ""),
    true
  );
});

test("auth and database failures expose only fixed recovery state", async () => {
  const failures: string[] = [];
  const auth = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({
      authenticate: async () => {
        throw new Error("secret auth detail");
      },
      reportFailure: (code) => failures.push(code),
    })
  );
  assert.equal(auth.status, 503);
  assert.doesNotMatch(JSON.stringify(await auth.json()), /secret auth detail/);

  const database = await handleCheckoutStatus(
    request(SESSION_ID),
    dependencies({
      findSettlementEvidence: async () => {
        throw new Error("secret database detail");
      },
      reportFailure: (code) => failures.push(code),
    })
  );
  assert.equal(database.status, 503);
  assert.doesNotMatch(
    JSON.stringify(await database.json()),
    /secret database detail/
  );
  assert.deepEqual(failures, [
    "checkout_confirmation_auth_failed",
    "checkout_confirmation_settlement_read_failed",
  ]);
});

test("missing and expired Supabase auth shapes resolve as normal absence", () => {
  for (const error of [
    {
      name: "AuthSessionMissingError",
      status: 400,
      code: "session_not_found",
    },
    { name: "AuthApiError", status: 403, code: "bad_jwt" },
    { name: "AuthApiError", status: 401, code: "jwt_expired" },
  ]) {
    assert.equal(
      resolveCheckoutStatusAuthentication({ user: null, error }),
      null
    );
  }
  assert.throws(
    () =>
      resolveCheckoutStatusAuthentication({
        user: null,
        error: { name: "AuthRetryableFetchError", status: 503 },
      }),
    /\[object Object\]/
  );
});

function request(
  sessionId: string | null,
  handle: string | null = RETURN_HANDLE
): NextRequest {
  const cookies =
    sessionId && handle
      ? {
          [checkoutReturnCookieName(handle) ?? "invalid"]:
            encodeCheckoutReturnCookie(handle, sessionId) ?? sessionId,
        }
      : {};
  return requestWithCookies(handle, cookies);
}

function requestWithCookies(
  handle: string | null,
  cookies: Record<string, string>
): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest("https://meelni.com/api/checkout/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ returnHandle: handle }),
  });
}

function dependencies(
  overrides: Partial<CheckoutStatusDependencies> = {}
): CheckoutStatusDependencies {
  return {
    authenticate: async () => USER_ID,
    hasDeletionTombstone: async () => false,
    findSettlementEvidence: async () => [],
    reportFailure: () => {},
    ...overrides,
  };
}

function interviewPassEvidence(): CheckoutSettlementEvidence {
  return {
    checkoutSessionId: SESSION_ID,
    invoiceId: null,
    paymentUserId: USER_ID,
    status: "succeeded",
    creditGrantId: "grant-test-route",
    catalogId: "interview_pass",
    grantId: "grant-test-route",
    grantUserId: USER_ID,
    grantCatalogId: "interview_pass",
    grantSource: "checkout",
    grantSourceId: SESSION_ID,
    grantOriginalCredits: 1,
  };
}

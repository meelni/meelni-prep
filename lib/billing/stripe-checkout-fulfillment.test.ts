import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_FULFILLMENT_ERROR_CODES,
  type AuthoritativeCheckoutSession,
  type CheckoutFulfillmentDependencies,
  type CheckoutFulfillmentErrorCode,
  fulfillInterviewPassCheckout,
  isCheckoutFulfillmentError,
  isCheckoutFulfillmentTrigger,
  isCheckoutPaymentEventType,
} from "./stripe-checkout-fulfillment";

const SESSION_ID = "cs_test_interview_pass";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "cus_test_interview_pass";
const PRICE_ID = "price_test_interview_pass";

test("classifies only supported Checkout payment events", () => {
  for (const eventType of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
  ]) {
    assert.equal(isCheckoutPaymentEventType(eventType), true);
  }
  assert.equal(isCheckoutPaymentEventType("checkout.session.expired"), false);
  assert.equal(
    isCheckoutFulfillmentTrigger("checkout.session.completed"),
    true
  );
  assert.equal(
    isCheckoutFulfillmentTrigger("checkout.session.async_payment_succeeded"),
    true
  );
  assert.equal(
    isCheckoutFulfillmentTrigger("checkout.session.async_payment_failed"),
    false
  );
});

test("fulfills an authoritative paid Interview Pass exactly once per call", async () => {
  const fixture = createFixture();

  const result = await fulfillInterviewPassCheckout(
    completedInput(),
    fixture.deps
  );

  assert.deepEqual(result, {
    status: "fulfilled",
    sessionId: SESSION_ID,
    userId: USER_ID,
    grantId: `grant:${SESSION_ID}`,
    idempotencyKey: `stripe:checkout:${SESSION_ID}:interview_pass`,
    paymentIntentId: "pi_test_interview_pass",
    amountInCents: 2_900,
    currency: "usd",
  });
  assert.deepEqual(fixture.retrievedSessionIds, [SESSION_ID]);
  assert.deepEqual(fixture.grantInputs, [
    {
      userId: USER_ID,
      catalogId: "interview_pass",
      source: "checkout",
      sourceId: SESSION_ID,
      idempotencyKey: `stripe:checkout:${SESSION_ID}:interview_pass`,
    },
  ]);
  assert.deepEqual(fixture.claimInputs, [
    { customerId: CUSTOMER_ID, userId: USER_ID },
  ]);
});

test("acknowledges completed delayed payment as pending without granting", async () => {
  const fixture = createFixture({
    session: authoritativeSession({ paymentStatus: "unpaid" }),
  });

  const result = await fulfillInterviewPassCheckout(
    completedInput(),
    fixture.deps
  );

  assert.deepEqual(result, {
    status: "pending_payment",
    sessionId: SESSION_ID,
    userId: USER_ID,
  });
  assert.equal(fixture.grantInputs.length, 0);
  assert.equal(fixture.claimInputs.length, 0);
});

test("fulfills delayed payment only after authoritative async success", async () => {
  const fixture = createFixture();

  const result = await fulfillInterviewPassCheckout(
    {
      ...completedInput(),
      eventType: "checkout.session.async_payment_succeeded",
    },
    fixture.deps
  );

  assert.equal(result.status, "fulfilled");
  assert.equal(fixture.grantInputs.length, 1);
});

test("fails async success that is not authoritatively paid", async () => {
  const fixture = createFixture({
    session: authoritativeSession({ paymentStatus: "unpaid" }),
  });

  await rejectsWithCode(
    () =>
      fulfillInterviewPassCheckout(
        {
          ...completedInput(),
          eventType: "checkout.session.async_payment_succeeded",
        },
        fixture.deps
      ),
    CHECKOUT_FULFILLMENT_ERROR_CODES.paymentNotPaid
  );
  assert.equal(fixture.grantInputs.length, 0);
});

test("acknowledges async failure without provider reads or mutations", async () => {
  const fixture = createFixture({
    retrieveSession: async () => {
      throw new Error("provider_should_not_be_called");
    },
  });

  const result = await fulfillInterviewPassCheckout(
    {
      ...completedInput(),
      eventType: "checkout.session.async_payment_failed",
    },
    fixture.deps
  );

  assert.deepEqual(result, {
    status: "payment_failed",
    sessionId: SESSION_ID,
  });
  assert.equal(fixture.retrievedSessionIds.length, 0);
  assert.equal(fixture.grantInputs.length, 0);
  assert.equal(fixture.claimInputs.length, 0);
});

test("completed and async-success deliveries converge on one grant", async () => {
  const durableGrants = new Map<string, string>();
  const fixture = createFixture({
    grantInterviewPass: async (input) => {
      const existing = durableGrants.get(input.idempotencyKey);
      if (existing) return { grantId: existing };
      const grantId = `grant:${input.sourceId}`;
      durableGrants.set(input.idempotencyKey, grantId);
      return { grantId };
    },
  });

  const [completed, asyncSuccess] = await Promise.all([
    fulfillInterviewPassCheckout(completedInput(), fixture.deps),
    fulfillInterviewPassCheckout(
      {
        ...completedInput(),
        eventType: "checkout.session.async_payment_succeeded",
      },
      fixture.deps
    ),
  ]);

  assert.equal(completed.status, "fulfilled");
  assert.equal(asyncSuccess.status, "fulfilled");
  assert.equal(durableGrants.size, 1);
  assert.equal(fixture.grantInputs.length, 2);
  assert.equal(
    new Set(fixture.grantInputs.map(({ idempotencyKey }) => idempotencyKey))
      .size,
    1
  );
});

test("async failure delivered after success does not revoke the grant", async () => {
  const durableGrants = new Map<string, string>();
  const fixture = createFixture({
    grantInterviewPass: async (input) => {
      const grantId = `grant:${input.sourceId}`;
      durableGrants.set(input.idempotencyKey, grantId);
      return { grantId };
    },
  });

  await fulfillInterviewPassCheckout(completedInput(), fixture.deps);
  const failed = await fulfillInterviewPassCheckout(
    {
      ...completedInput(),
      eventType: "checkout.session.async_payment_failed",
    },
    fixture.deps
  );

  assert.equal(failed.status, "payment_failed");
  assert.equal(durableGrants.size, 1);
  assert.equal(fixture.grantInputs.length, 1);
});

test("account deletion pending returns a no-grant reconciliation outcome", async () => {
  const fixture = createFixture({ hasDeletionTombstone: async () => true });

  const result = await fulfillInterviewPassCheckout(
    completedInput(),
    fixture.deps
  );

  assert.deepEqual(result, {
    status: "account_deletion_pending",
    sessionId: SESSION_ID,
    userId: USER_ID,
  });
  assert.equal(fixture.grantInputs.length, 0);
  assert.deepEqual(fixture.claimInputs, [
    { customerId: CUSTOMER_ID, userId: USER_ID },
  ]);
});

test("claims a customer or accepts a customerless session after account correlation", async () => {
  const customer = createFixture();
  const noCustomer = createFixture({
    session: authoritativeSession({ customerId: null }),
  });

  assert.equal(
    (await fulfillInterviewPassCheckout(completedInput(), customer.deps))
      .status,
    "fulfilled"
  );
  assert.equal(
    (await fulfillInterviewPassCheckout(completedInput(), noCustomer.deps))
      .status,
    "fulfilled"
  );
  assert.deepEqual(customer.claimInputs, [
    { customerId: CUSTOMER_ID, userId: USER_ID },
  ]);
  assert.equal(noCustomer.claimInputs.length, 0);
});

test("rejects a provider customer mapped to another account", async () => {
  const fixture = createFixture({
    claimCustomerOwnership: async () => {
      throw Object.assign(new Error("owner mismatch"), {
        code: "stripe_subject_owner_mismatch",
      });
    },
  });

  await rejectsWithCode(
    () => fulfillInterviewPassCheckout(completedInput(), fixture.deps),
    CHECKOUT_FULFILLMENT_ERROR_CODES.ownerMismatch
  );
  assert.equal(fixture.grantInputs.length, 0);
});

test("validates every authoritative product and account invariant before grant", async (t) => {
  const cases: Array<{
    name: string;
    session: AuthoritativeCheckoutSession;
    code: CheckoutFulfillmentErrorCode;
  }> = [
    {
      name: "session id",
      session: authoritativeSession({ id: "cs_test_other" }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.sessionMismatch,
    },
    {
      name: "complete status",
      session: authoritativeSession({ status: "open" }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.sessionStatusInvalid,
    },
    {
      name: "payment mode",
      session: authoritativeSession({ mode: "subscription" }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.modeInvalid,
    },
    {
      name: "matching user correlation",
      session: authoritativeSession({
        clientReferenceId: "22222222-2222-4222-8222-222222222222",
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.ownerInvalid,
    },
    {
      name: "canonical UUID owner",
      session: authoritativeSession({
        clientReferenceId: "not-a-uuid",
        metadata: { userId: "not-a-uuid", catalogId: "interview_pass" },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.ownerInvalid,
    },
    {
      name: "Interview Pass catalog",
      session: authoritativeSession({
        metadata: { userId: USER_ID, catalogId: "starter" },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.catalogInvalid,
    },
    {
      name: "complete line items",
      session: authoritativeSession({
        lineItems: {
          data: [lineItem()],
          hasMore: true,
        },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemsIncomplete,
    },
    {
      name: "one line item",
      session: authoritativeSession({
        lineItems: { data: [], hasMore: false },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid,
    },
    {
      name: "configured price",
      session: authoritativeSession({
        lineItems: {
          data: [lineItem({ priceId: "price_test_other" })],
          hasMore: false,
        },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid,
    },
    {
      name: "quantity one",
      session: authoritativeSession({
        lineItems: {
          data: [lineItem({ quantity: 2 })],
          hasMore: false,
        },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid,
    },
    {
      name: "session currency",
      session: authoritativeSession({ currency: "eur" }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.currencyInvalid,
    },
    {
      name: "line-item currency",
      session: authoritativeSession({
        lineItems: {
          data: [lineItem({ currency: "eur" })],
          hasMore: false,
        },
      }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.currencyInvalid,
    },
    {
      name: "paid status",
      session: authoritativeSession({ paymentStatus: "no_payment_required" }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.paymentNotPaid,
    },
    {
      name: "payment reference",
      session: authoritativeSession({ paymentIntentId: null }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.paymentReferenceMissing,
    },
    {
      name: "payment amount",
      session: authoritativeSession({ amountTotal: null }),
      code: CHECKOUT_FULFILLMENT_ERROR_CODES.paymentAmountInvalid,
    },
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const fixture = createFixture({ session: candidate.session });
      await rejectsWithCode(
        () => fulfillInterviewPassCheckout(completedInput(), fixture.deps),
        candidate.code
      );
      assert.equal(fixture.grantInputs.length, 0);
      assert.equal(fixture.claimInputs.length, 0);
    });
  }
});

test("invalid product evidence fails before an unpaid completion is accepted", async () => {
  const fixture = createFixture({
    session: authoritativeSession({
      paymentStatus: "unpaid",
      lineItems: {
        data: [lineItem({ priceId: "price_test_other" })],
        hasMore: false,
      },
    }),
  });

  await rejectsWithCode(
    () => fulfillInterviewPassCheckout(completedInput(), fixture.deps),
    CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid
  );
});

test("a transient ownership-claim failure stays retryable and occurs before grant", async () => {
  let claimAttempts = 0;
  const fixture = createFixture({
    claimCustomerOwnership: async () => {
      claimAttempts += 1;
      if (claimAttempts === 1) throw new Error("mapping_unavailable");
    },
  });

  await assert.rejects(
    () => fulfillInterviewPassCheckout(completedInput(), fixture.deps),
    /mapping_unavailable/
  );
  assert.equal(fixture.grantInputs.length, 0);
  const replay = await fulfillInterviewPassCheckout(
    completedInput(),
    fixture.deps
  );

  assert.equal(replay.status, "fulfilled");
  assert.equal(claimAttempts, 2);
  assert.equal(fixture.grantInputs.length, 1);
});

test("provider retrieval failure stays retryable and cannot grant", async () => {
  const fixture = createFixture({
    retrieveSession: async () => {
      throw new Error("stripe_temporarily_unavailable");
    },
  });

  await assert.rejects(
    () => fulfillInterviewPassCheckout(completedInput(), fixture.deps),
    /stripe_temporarily_unavailable/
  );
  assert.equal(fixture.grantInputs.length, 0);
  assert.equal(fixture.claimInputs.length, 0);
});

function completedInput() {
  return {
    eventType: "checkout.session.completed" as const,
    sessionId: SESSION_ID,
    expectedPriceId: PRICE_ID,
  };
}

function authoritativeSession(
  overrides: Partial<AuthoritativeCheckoutSession> = {}
): AuthoritativeCheckoutSession {
  return {
    id: SESSION_ID,
    status: "complete",
    paymentStatus: "paid",
    mode: "payment",
    clientReferenceId: USER_ID,
    metadata: { userId: USER_ID, catalogId: "interview_pass" },
    customerId: CUSTOMER_ID,
    paymentIntentId: "pi_test_interview_pass",
    amountTotal: 2_900,
    currency: "usd",
    lineItems: { data: [lineItem()], hasMore: false },
    ...overrides,
  };
}

function lineItem(
  overrides: Partial<
    AuthoritativeCheckoutSession["lineItems"]["data"][number]
  > = {}
) {
  return {
    priceId: PRICE_ID,
    quantity: 1,
    currency: "usd",
    ...overrides,
  };
}

function createFixture(
  overrides: {
    session?: AuthoritativeCheckoutSession;
    retrieveSession?: CheckoutFulfillmentDependencies["retrieveSession"];
    claimCustomerOwnership?: CheckoutFulfillmentDependencies["claimCustomerOwnership"];
    hasDeletionTombstone?: CheckoutFulfillmentDependencies["hasDeletionTombstone"];
    grantInterviewPass?: CheckoutFulfillmentDependencies["grantInterviewPass"];
  } = {}
) {
  const retrievedSessionIds: string[] = [];
  const deletionUserIds: string[] = [];
  const grantInputs: Parameters<
    CheckoutFulfillmentDependencies["grantInterviewPass"]
  >[0][] = [];
  const claimInputs: Parameters<
    CheckoutFulfillmentDependencies["claimCustomerOwnership"]
  >[0][] = [];
  const session = overrides.session ?? authoritativeSession();
  const retrieveSession =
    overrides.retrieveSession ?? (async () => structuredClone(session));
  const grantInterviewPass =
    overrides.grantInterviewPass ??
    (async (input) => ({ grantId: `grant:${input.sourceId}` }));
  const claimCustomerOwnership =
    overrides.claimCustomerOwnership ?? (async () => undefined);

  const deps: CheckoutFulfillmentDependencies = {
    async retrieveSession(sessionId) {
      retrievedSessionIds.push(sessionId);
      return retrieveSession(sessionId);
    },
    async claimCustomerOwnership(input) {
      claimInputs.push(input);
      return claimCustomerOwnership(input);
    },
    async hasDeletionTombstone(userId) {
      deletionUserIds.push(userId);
      return overrides.hasDeletionTombstone?.(userId) ?? false;
    },
    async grantInterviewPass(input) {
      grantInputs.push(input);
      return grantInterviewPass(input);
    },
  };

  return {
    deps,
    retrievedSessionIds,
    deletionUserIds,
    grantInputs,
    claimInputs,
  };
}

async function rejectsWithCode(
  operation: () => Promise<unknown>,
  code: CheckoutFulfillmentErrorCode
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(isCheckoutFulfillmentError(error), true);
    if (!isCheckoutFulfillmentError(error)) return false;
    assert.equal(error.code, code);
    assert.equal(error.message, "Stripe Checkout fulfillment failed");
    const serialized = JSON.stringify(error);
    assert.equal(serialized.includes(SESSION_ID), false);
    assert.equal(serialized.includes(USER_ID), false);
    assert.equal(serialized.includes(CUSTOMER_ID), false);
    assert.equal(serialized.includes(PRICE_ID), false);
    return true;
  });
}

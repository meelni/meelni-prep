import assert from "node:assert/strict";
import test from "node:test";

import {
  claimStripeCustomerOwnership,
  resolveAuthoritativeStripeUserId,
  type StripeCustomerOwnershipDatabase,
} from "./stripe-customer-ownership";

const CUSTOMER_ID = "cus_test_owner_claim";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

test("Stripe customer ownership claim inserts or accepts only the requested owner", async () => {
  const inserted = createClaimDatabase();

  await claimStripeCustomerOwnership(
    { customerId: CUSTOMER_ID, userId: USER_A },
    inserted.database
  );
  await claimStripeCustomerOwnership(
    { customerId: CUSTOMER_ID, userId: USER_A },
    inserted.database
  );

  assert.equal(inserted.owners.get(CUSTOMER_ID), USER_A);
  assert.equal(inserted.calls.length, 2);
  for (const call of inserted.calls) {
    assert.deepEqual(call.values, {
      stripeCustomerId: CUSTOMER_ID,
      userId: USER_A,
    });
    assert.equal(
      Object.hasOwn(call.conflictSet, "userId"),
      false,
      "the conflict path must never update the stored owner"
    );
    assert.equal(
      call.hasOwnerCondition,
      true,
      "the conflict path must return only the matching stored owner"
    );
  }
});

test("Stripe customer ownership claim rejects a conflicting owner without changing it", async () => {
  const fixture = createClaimDatabase([[CUSTOMER_ID, USER_A]]);

  await assert.rejects(
    () =>
      claimStripeCustomerOwnership(
        { customerId: CUSTOMER_ID, userId: USER_B },
        fixture.database
      ),
    hasOwnerMismatchCode
  );

  assert.equal(fixture.owners.get(CUSTOMER_ID), USER_A);
});

test("concurrent matching ownership claims both converge on the same owner", async () => {
  const fixture = createClaimDatabase([], 2);
  const claims = [
    claimStripeCustomerOwnership(
      { customerId: CUSTOMER_ID, userId: USER_A },
      fixture.database
    ),
    claimStripeCustomerOwnership(
      { customerId: CUSTOMER_ID, userId: USER_A },
      fixture.database
    ),
  ];

  const results = await Promise.allSettled(claims);

  assert.deepEqual(
    results.map(({ status }) => status),
    ["fulfilled", "fulfilled"]
  );
  assert.equal(fixture.owners.get(CUSTOMER_ID), USER_A);
});

test("concurrent competing ownership claims allow one winner and reject the other", async () => {
  const fixture = createClaimDatabase([], 2);
  const results = await Promise.allSettled([
    claimStripeCustomerOwnership(
      { customerId: CUSTOMER_ID, userId: USER_A },
      fixture.database
    ),
    claimStripeCustomerOwnership(
      { customerId: CUSTOMER_ID, userId: USER_B },
      fixture.database
    ),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1
  );
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.equal(rejected?.status, "rejected");
  if (rejected?.status === "rejected") {
    assert.equal(hasOwnerMismatchCode(rejected.reason), true);
  }

  const winner = fixture.owners.get(CUSTOMER_ID);
  assert.ok(winner === USER_A || winner === USER_B);
  assert.equal(fixture.owners.size, 1);
});

test("Stripe ownership accepts one consistent provider subject owner", () => {
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "valid",
      eventUserId: "user-a",
      mappedUserId: "user-a",
      tombstoneUserId: "user-a",
    }),
    "user-a"
  );
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "not_applicable",
      eventUserId: null,
      mappedUserId: null,
      tombstoneUserId: "user-a",
    }),
    "user-a"
  );
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "not_applicable",
      eventUserId: "metadata-only-user",
      mappedUserId: null,
      tombstoneUserId: null,
    }),
    null
  );
});

test("Stripe ownership fails closed on correlation or owner disagreement", () => {
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "invalid",
        eventUserId: null,
        mappedUserId: null,
        tombstoneUserId: "user-a",
      }),
    hasOwnerMismatchCode
  );
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "valid",
        eventUserId: "user-a",
        mappedUserId: "user-b",
        tombstoneUserId: null,
      }),
    hasOwnerMismatchCode
  );
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "not_applicable",
        eventUserId: "user-a",
        mappedUserId: null,
        tombstoneUserId: "user-b",
      }),
    hasOwnerMismatchCode
  );
});

function hasOwnerMismatchCode(error: unknown) {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code ===
      "stripe_subject_owner_mismatch"
  );
}

interface ClaimCall {
  values: { stripeCustomerId: string; userId: string };
  conflictSet: Record<string, unknown>;
  hasOwnerCondition: boolean;
}

function createClaimDatabase(
  initialOwners: ReadonlyArray<readonly [string, string]> = [],
  releaseAfterClaims = 0
) {
  const owners = new Map(initialOwners);
  const calls: ClaimCall[] = [];
  let waitingClaims = 0;
  let releaseClaims: (() => void) | undefined;
  const claimsReady =
    releaseAfterClaims > 0
      ? new Promise<void>((resolve) => {
          releaseClaims = resolve;
        })
      : Promise.resolve();

  const database = {
    insert() {
      return {
        values(values: { stripeCustomerId: string; userId: string }) {
          return {
            onConflictDoUpdate(config: {
              set: Record<string, unknown>;
              setWhere?: unknown;
            }) {
              calls.push({
                values,
                conflictSet: config.set,
                hasOwnerCondition: Boolean(config.setWhere),
              });
              return {
                async returning() {
                  if (releaseAfterClaims > 0) {
                    waitingClaims += 1;
                    if (waitingClaims === releaseAfterClaims) releaseClaims?.();
                    await claimsReady;
                  }

                  const existingOwner = owners.get(values.stripeCustomerId);
                  if (!existingOwner) {
                    owners.set(values.stripeCustomerId, values.userId);
                    return [{ userId: values.userId }];
                  }
                  return existingOwner === values.userId
                    ? [{ userId: existingOwner }]
                    : [];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as StripeCustomerOwnershipDatabase;

  return { database, owners, calls };
}

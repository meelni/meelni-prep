import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  subscriptionWrites: [] as Array<Record<string, unknown>>,
  mappingWrites: [] as Array<Record<string, unknown>>,
  grantCalls: [] as Array<Record<string, unknown>>,
  transactionUpdateResults: [] as boolean[],
  selectResponses: [] as Array<Array<Record<string, unknown>>>,
  lastSelectResponse: [] as Array<Record<string, unknown>>,
  tombstoneFingerprints: new Set<string>(),
  checkoutSession: {} as Record<string, unknown>,
  retrieveCheckoutSession: vi.fn(),
  ownershipClaims: [] as Array<Record<string, string>>,
  deletedCustomerIds: [] as string[],
  signatureCalls: 0,
  currentEvent: null as Record<string, unknown> | null,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent(body: string) {
        state.signatureCalls += 1;
        state.currentEvent = JSON.parse(body);
        return state.currentEvent;
      },
    };
    subscriptions = {
      retrieve: vi.fn(async () => {
        const data = state.currentEvent?.data as
          | { object?: Record<string, unknown> }
          | undefined;
        if (!data?.object) throw new Error("missing subscription fixture");
        return data.object;
      }),
    };
    invoicePayments = {
      list: vi.fn(async () => ({ data: [] })),
    };
    checkout = {
      sessions: {
        retrieve: state.retrieveCheckoutSession,
        expire: vi.fn(async () => undefined),
      },
    };
    customers = {
      del: vi.fn(async (customerId: string) => {
        state.deletedCustomerIds.push(customerId);
      }),
    };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const response =
              state.selectResponses.length > 0
                ? (state.selectResponses.shift() ?? [])
                : state.logs.slice(0, 1);
            state.lastSelectResponse = response;
            return response;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          if ("stripeInvoiceId" in value) {
            const duplicate = state.payments.some(
              (row) =>
                row.stripeInvoiceId === value.stripeInvoiceId &&
                row.status === value.status
            );
            if (!duplicate) state.payments.push(value);
          }
          if ("stripeCheckoutSessionId" in value) {
            const duplicate = state.payments.some(
              (row) =>
                row.stripeCheckoutSessionId === value.stripeCheckoutSessionId
            );
            if (!duplicate) state.payments.push(value);
          }
          return {
            returning: async () => {
              if (!("eventType" in value)) return [];
              const conflict = state.logs.some(
                (row) =>
                  row.stripeEventId === value.stripeEventId ||
                  (value.logicalEventKey &&
                    row.logicalEventKey === value.logicalEventKey)
              );
              if (conflict) return [];
              const row = { id: `log-${state.logs.length + 1}`, ...value };
              state.logs.push(row);
              return [row];
            },
          };
        },
        onConflictDoUpdate: async () => undefined,
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(value);
          if (
            value.status === "pending" ||
            value.status === "processed" ||
            value.status === "failed" ||
            "processedAt" in value ||
            "lastError" in value
          ) {
            Object.assign(state.logs[0] ?? {}, value);
          }
        },
      }),
    }),
    transaction: async (
      work: (tx: Record<string, (...args: never[]) => unknown>) => unknown
    ) => {
      let selectCount = 0;
      return work({
        execute: async () => [
          { currentTime: new Date("2026-07-12T00:00:00Z") },
        ],
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => {
                selectCount += 1;
                const response =
                  selectCount === 1
                    ? [{ id: "billing-user" }]
                    : selectCount === 2
                      ? []
                      : state.selectResponses.length > 0
                        ? (state.selectResponses.shift() ?? [])
                        : selectCount >= 4
                          ? [
                              {
                                status: "active",
                                stripeSubscriptionId: "sub_route_test",
                                version: 1,
                                lastEventTimestamp: null,
                              },
                            ]
                          : state.lastSelectResponse;
                return Object.assign(Promise.resolve(response), {
                  for: async () => response,
                });
              },
            }),
          }),
        }),
        insert: () => ({
          values: (value: Record<string, unknown>) => {
            if ("stripeSubscriptionId" in value && "status" in value) {
              state.subscriptionWrites.push(value);
            }
            if (
              "stripeCustomerId" in value &&
              "userId" in value &&
              !("status" in value)
            ) {
              state.mappingWrites.push(value);
            }
            if ("stripeInvoiceId" in value && "status" in value) {
              const duplicate = state.payments.some(
                (row) =>
                  row.stripeInvoiceId === value.stripeInvoiceId &&
                  row.status === value.status
              );
              if (!duplicate) state.payments.push(value);
            }
            return {
              onConflictDoUpdate: async () => undefined,
              onConflictDoNothing: async () => undefined,
            };
          },
        }),
        update: () => ({
          set: (value: Record<string, unknown>) => {
            state.updates.push(value);
            return {
              where: () => ({
                returning: async () => {
                  const applies =
                    state.transactionUpdateResults.shift() ?? true;
                  if (!applies) return [];
                  state.subscriptionWrites.push(value);
                  return [{ id: "subscription-route" }];
                },
              }),
            };
          },
        }),
      });
    },
  },
}));

vi.mock("@/lib/billing/credits", () => ({
  createCreditLedgerService: vi.fn(() => ({
    grantCredits: vi.fn(async (input: Record<string, unknown>) => {
      state.grantCalls.push(input);
      return { grant: { id: "grant_route" } };
    }),
    renewSubscriptionCredits: vi.fn(async () => ({
      grant: { id: "grant_renewal_route" },
    })),
  })),
}));

vi.mock("@/lib/billing/credit-ledger-store", () => ({
  createDrizzleCreditLedgerStore: vi.fn(() => ({})),
  createDrizzleCreditLedgerStoreForLockedTransaction: vi.fn(() => ({})),
}));

vi.mock("@/lib/billing/stripe-customer-ownership", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/billing/stripe-customer-ownership")
    >();
  return {
    ...actual,
    claimStripeCustomerOwnership: vi.fn(
      async (input: Record<string, string>) => {
        state.ownershipClaims.push(input);
      }
    ),
    getMappedStripeCustomerUserId: vi.fn(async () => {
      const mappingResponse = state.selectResponses[1];
      const mapping = mappingResponse?.[0];
      if (mappingResponse?.length === 0 || mapping?.userId === "mapped_user") {
        state.selectResponses.splice(1, 1);
      }
      return mapping?.userId === "mapped_user" ? mapping.userId : null;
    }),
  };
});

vi.mock("@/lib/db/account-deletions", () => ({
  findStripeDeletionTombstoneFingerprint: vi.fn(
    async (fingerprints: string[]) =>
      fingerprints.find((fingerprint) =>
        state.tombstoneFingerprints.has(fingerprint)
      ) ?? null
  ),
  getAccountDeletionRequestByStripeFingerprint: vi.fn(
    async (fingerprint: string) =>
      state.tombstoneFingerprints.has(fingerprint)
        ? {
            userId: "11111111-1111-4111-8111-111111111111",
            status: "completed",
            stripeSubjects: [],
            attempts: 1,
          }
        : undefined
  ),
  hasAccountDeletionTombstone: vi.fn(async () => false),
  getAccountDeletionRequest: vi.fn(async () => undefined),
  clearLateStripeDeletionSubjects: vi.fn(async () => true),
  markLateStripeReconciliationFailed: vi.fn(async () => undefined),
  recordLateStripeDeletionSubjects: vi.fn(async () => true),
  redactStripeEventLogs: vi.fn(async () => undefined),
}));

import { fingerprintStripeSubject } from "@/lib/billing/stripe-privacy";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { POST } from "./route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    state.logs.length = 0;
    state.payments.length = 0;
    state.updates.length = 0;
    state.subscriptionWrites.length = 0;
    state.mappingWrites.length = 0;
    state.grantCalls.length = 0;
    state.transactionUpdateResults.length = 0;
    state.selectResponses.length = 0;
    state.lastSelectResponse = [];
    state.tombstoneFingerprints.clear();
    state.ownershipClaims.length = 0;
    state.deletedCustomerIds.length = 0;
    state.signatureCalls = 0;
    state.currentEvent = null;
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_route";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route";
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_starter_route";
    process.env.STRIPE_INTERVIEW_PASS_PRICE_ID = "price_pass_route";
    state.checkoutSession = authoritativeCheckoutSession();
    state.retrieveCheckoutSession.mockImplementation(async () =>
      structuredClone(state.checkoutSession)
    );
  });

  it("replays and acknowledges distinct Event IDs for one logical transition", async () => {
    const first = await POST(
      request(event("evt_first", "customer.subscription.trial_will_end"))
    );
    const second = await POST(
      request(event("evt_second", "customer.subscription.trial_will_end"))
    );

    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({
      received: true,
      status: "logical_replay",
    });
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({
      stripeEventId: "evt_first",
      logicalEventKey: "customer.subscription.trial_will_end:sub_route_test",
      status: "processed",
    });
  });

  it("redacts and acknowledges a late refund for a deleted payment subject", async () => {
    state.tombstoneFingerprints.add(fingerprintStripeSubject("pi_deleted")!);
    const response = await POST(
      request({
        id: "evt_deleted_refund",
        type: "refund.created",
        data: {
          object: {
            id: "re_deleted",
            object: "refund",
            payment_intent: "pi_deleted",
            amount: 900,
            currency: "usd",
            status: "succeeded",
          },
        },
      })
    );

    expect(await response.json()).toEqual({
      received: true,
      status: "deleted_subject",
    });
    expect(state.logs[0]).toMatchObject({
      payload: "{}",
      status: "processed",
      subjectFingerprint: fingerprintStripeSubject("pi_deleted"),
    });
  });

  it("matches a deleted payment intent even when a customer fingerprint appears first", async () => {
    const paymentFingerprint = fingerprintStripeSubject("pi_deleted")!;
    state.tombstoneFingerprints.add(paymentFingerprint);
    const response = await POST(
      request({
        id: "evt_deleted_charge",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_deleted",
            object: "charge",
            customer: "cus_not_tombstoned",
            payment_intent: "pi_deleted",
          },
        },
      })
    );

    expect(await response.json()).toEqual({
      received: true,
      status: "deleted_subject",
    });
    expect(state.logs[0]).toMatchObject({
      payload: "{}",
      status: "processed",
      subjectFingerprint: paymentFingerprint,
    });
  });

  it.each([
    {
      name: "checkout",
      payload: {
        id: "evt_checkout_owner_conflict",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_owner_conflict",
            object: "checkout.session",
            metadata: { userId: "metadata_user", catalogId: "interview_pass" },
            customer: "cus_owner_conflict",
            payment_status: "paid",
            payment_intent: "pi_owner_conflict",
            amount_total: 900,
            currency: "usd",
          },
        },
      },
    },
    {
      name: "subscription",
      payload: {
        id: "evt_subscription_owner_conflict",
        type: "customer.subscription.created",
        created: 1_000,
        data: {
          object: {
            id: "sub_owner_conflict",
            object: "subscription",
            customer: "cus_owner_conflict",
            metadata: { userId: "metadata_user" },
          },
        },
      },
    },
    {
      name: "invoice",
      payload: failedInvoiceEvent(
        "evt_invoice_owner_conflict",
        1_000,
        "cus_owner_conflict"
      ),
    },
  ])(
    "fails closed on $name customer-owner disagreement",
    async ({ payload }) => {
      state.selectResponses.push([], [{ userId: "mapped_user" }]);
      const response = await POST(request(payload));

      expect(response.status).toBe(500);
      expect(state.logs).toHaveLength(0);
      expect(state.updates).toHaveLength(0);
      expect(state.subscriptionWrites).toHaveLength(0);
    }
  );

  it("preserves the first provider-derived failed-invoice grace deadline across logical replay", async () => {
    const firstCreated = 1_000;
    const persistedPayment = {
      userId: "invoice_user",
      stripePaymentIntentId: null,
      stripeInvoiceId: "in_failed",
      stripeChargeId: null,
      creditGrantId: null,
      catalogId: "starter",
      amountInCents: 900,
      currency: "usd",
      status: "failed",
      createdAt: new Date(firstCreated * 1_000),
    };
    state.selectResponses.push([], [], [], [persistedPayment]);
    expect(
      (
        await POST(
          request(failedInvoiceEvent("evt_failed_first", firstCreated))
        )
      ).status
    ).toBe(200);

    state.selectResponses.push([state.logs[0]!], [], [], [persistedPayment]);
    const replay = await POST(
      request(failedInvoiceEvent("evt_failed_replay", firstCreated + 86_400))
    );
    expect(await replay.json()).toEqual({
      received: true,
      status: "logical_replay",
    });

    const graceUpdates = state.updates.filter(
      (update) => update.status === "past_due"
    );
    expect(graceUpdates).toHaveLength(2);
    expect(graceUpdates[0]?.gracePeriodEnd).toEqual(
      new Date((firstCreated + 7 * 86_400) * 1_000)
    );
    expect(graceUpdates[1]?.gracePeriodEnd).toEqual(
      graceUpdates[0]?.gracePeriodEnd
    );
    expect(state.payments).toHaveLength(1);
  });

  it.each(["failure_then_success", "success_then_failure"] as const)(
    "converges invoice and grace truth for %s delivery",
    async (order) => {
      const failed = failedInvoiceEvent("evt_invoice_failed", 1_000);
      const succeeded = succeededInvoiceEvent("evt_invoice_succeeded", 1_001);
      const failedPayment = {
        userId: "invoice_user",
        stripePaymentIntentId: null,
        stripeInvoiceId: "in_failed",
        stripeChargeId: null,
        creditGrantId: null,
        catalogId: "starter",
        amountInCents: 900,
        currency: "usd",
        status: "failed",
        createdAt: new Date(1_000_000),
      };
      const succeededPayment = {
        ...failedPayment,
        stripePaymentIntentId: "pi_invoice",
        stripeChargeId: "ch_invoice",
        creditGrantId: "grant_renewal_route",
        status: "succeeded",
      };

      if (order === "failure_then_success") {
        state.selectResponses.push([], [], [], [failedPayment]);
        expect((await POST(request(failed))).status).toBe(200);
        state.selectResponses.push(
          [],
          [invoiceSubscriptionRow(1_001)],
          [succeededPayment]
        );
        expect((await POST(request(succeeded))).status).toBe(200);
      } else {
        state.selectResponses.push(
          [],
          [invoiceSubscriptionRow(1_001)],
          [succeededPayment]
        );
        expect((await POST(request(succeeded))).status).toBe(200);
        state.selectResponses.push([], [succeededPayment]);
        expect((await POST(request(failed))).status).toBe(200);
      }

      const subscriptionStates = state.updates.filter(
        (update) => update.status === "active" || update.status === "past_due"
      );
      expect(subscriptionStates.at(-1)?.status).toBe("active");
      expect(subscriptionStates.at(-1)?.gracePeriodEnd).toBeNull();
      expect(
        state.payments.filter((payment) => payment.status === "succeeded")
      ).toHaveLength(1);
    }
  );

  it("rejects a declared oversized body before signature verification", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: {
          "stripe-signature": "test-signature",
          "content-length": String(65 * 1024),
        },
      })
    );
    expect(response.status).toBe(413);
    expect(state.signatureCalls).toBe(0);
  });

  it("cancels a chunked body at the byte cap before signature verification", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(40 * 1024));
      },
    });
    const response = await POST(streamRequest(body));
    expect(response.status).toBe(413);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(reads).toBeLessThanOrEqual(3);
    expect(state.signatureCalls).toBe(0);
  });

  it("keeps the oversized verdict when stream cancellation rejects", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(40 * 1024));
      },
      cancel() {
        throw new Error("private cancellation detail");
      },
    });
    const response = await POST(streamRequest(body));
    expect(response.status).toBe(413);
    expect(state.signatureCalls).toBe(0);
  });

  it("fails closed when the body stream aborts", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("private Stripe body"));
        controller.error(new Error("private abort detail"));
      },
    });
    const response = await POST(streamRequest(body));
    expect(response.status).toBe(400);
    expect(state.signatureCalls).toBe(0);
  });

  it("stops a pending body read when the request signal aborts", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
    });
    const responsePromise = POST(streamRequest(body, controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    const response = await responsePromise;
    expect(response.status).toBe(400);
    expect(state.signatureCalls).toBe(0);
  });

  it("fails a logical payment replay when persisted truth disagrees", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    state.checkoutSession = authoritativeCheckoutSession({
      id: "cs_route",
      client_reference_id: userId,
      metadata: { userId, catalogId: "interview_pass" },
      payment_intent: "pi_route",
      amount_total: 900,
    });
    state.selectResponses.push(
      [],
      [
        {
          userId: "different_user",
          stripePaymentIntentId: "pi_route",
          creditGrantId: "grant_route",
          catalogId: "interview_pass",
          amountInCents: 900,
          currency: "usd",
          status: "succeeded",
        },
      ]
    );
    const response = await POST(
      request({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_route",
            object: "checkout.session",
            mode: "payment",
            client_reference_id: userId,
            metadata: {
              userId,
              catalogId: "interview_pass",
            },
            customer: null,
            payment_status: "paid",
            payment_intent: "pi_route",
            amount_total: 900,
            currency: "usd",
          },
        },
      })
    );

    expect(response.status).toBe(500);
    expect(state.logs[0]).toMatchObject({
      status: "failed",
      lastError: "billing_payment_truth_mismatch",
    });
  });

  it.each(["partially_refunded", "refunded", "disputed"])(
    "preserves a %s payment transition when completed arrives after async success",
    async (adjustedStatus) => {
      const userId = "11111111-1111-4111-8111-111111111111";
      const sessionId = `cs_route_${adjustedStatus}`;
      const paymentIntentId = `pi_route_${adjustedStatus}`;
      const persisted = {
        userId,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: sessionId,
        stripeEventId: `evt_async_${adjustedStatus}`,
        creditGrantId: "grant_route",
        catalogId: "interview_pass",
        amountInCents: 900,
        currency: "usd",
        status: "succeeded",
        tier: "interview_pass",
      };
      state.checkoutSession = authoritativeCheckoutSession({
        id: sessionId,
        client_reference_id: userId,
        metadata: { userId, catalogId: "interview_pass" },
        payment_intent: paymentIntentId,
        amount_total: 900,
      });
      state.selectResponses.push([], [persisted]);

      const asyncSuccess = await POST(
        request({
          id: `evt_async_${adjustedStatus}`,
          type: "checkout.session.async_payment_succeeded",
          data: {
            object: {
              id: sessionId,
              object: "checkout.session",
              mode: "payment",
              client_reference_id: userId,
              metadata: { userId, catalogId: "interview_pass" },
              customer: null,
            },
          },
        })
      );
      expect(asyncSuccess.status).toBe(200);

      const storedPayment = state.payments.find(
        (payment) => payment.stripeCheckoutSessionId === sessionId
      );
      expect(storedPayment).toBeDefined();
      Object.assign(storedPayment ?? {}, { status: adjustedStatus });
      state.selectResponses.push(
        [],
        [{ ...persisted, status: adjustedStatus }]
      );

      const delayedCompletion = await POST(
        request({
          id: `evt_completed_${adjustedStatus}`,
          type: "checkout.session.completed",
          data: {
            object: {
              id: sessionId,
              object: "checkout.session",
              mode: "payment",
              client_reference_id: userId,
              metadata: { userId, catalogId: "interview_pass" },
              customer: null,
            },
          },
        })
      );

      expect(delayedCompletion.status).toBe(200);
      expect(storedPayment?.status).toBe(adjustedStatus);
      expect(state.grantCalls).toHaveLength(2);
      expect(
        new Set(state.grantCalls.map((grant) => grant.idempotencyKey)).size
      ).toBe(1);
    }
  );

  it("durably rejects a malformed matching Checkout owner before any UUID tombstone query", async () => {
    const malformedUserId = "not-a-uuid";
    state.checkoutSession = authoritativeCheckoutSession({
      id: "cs_route_malformed_owner",
      client_reference_id: malformedUserId,
      metadata: {
        userId: malformedUserId,
        catalogId: "interview_pass",
      },
    });
    state.selectResponses.push([]);

    const response = await POST(
      request({
        id: "evt_checkout_malformed_owner",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_route_malformed_owner",
            object: "checkout.session",
            mode: "payment",
            client_reference_id: malformedUserId,
            metadata: {
              userId: malformedUserId,
              catalogId: "interview_pass",
            },
            customer: null,
          },
        },
      })
    );

    expect(response.status).toBe(500);
    expect(hasAccountDeletionTombstone).not.toHaveBeenCalled();
    expect(state.retrieveCheckoutSession).toHaveBeenCalledOnce();
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({
      stripeEventId: "evt_checkout_malformed_owner",
      status: "failed",
      lastError: "stripe_checkout_owner_invalid",
      payload: "{}",
    });
  });

  it("acknowledges an unpaid completion before every fulfillment mutation", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    state.checkoutSession = authoritativeCheckoutSession({
      id: "cs_route_unpaid",
      client_reference_id: userId,
      metadata: { userId, catalogId: "interview_pass" },
      customer: "cus_route_unpaid",
      payment_status: "unpaid",
      payment_intent: "pi_route_unpaid",
      amount_total: 900,
    });
    state.selectResponses.push([]);
    const response = await POST(
      request({
        id: "evt_checkout_unpaid",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_route_unpaid",
            object: "checkout.session",
            mode: "payment",
            client_reference_id: userId,
            metadata: {
              userId,
              catalogId: "interview_pass",
            },
            customer: "cus_route_unpaid",
            payment_status: "unpaid",
            payment_intent: "pi_route_unpaid",
            amount_total: 900,
            currency: "usd",
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(state.logs[0]).toMatchObject({
      status: "processed",
    });
    expect(state.grantCalls).toHaveLength(0);
    expect(state.ownershipClaims).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
    expect(state.subscriptionWrites).toHaveLength(0);
  });

  it("persists authoritative payment truth for delayed Checkout success", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const persisted = {
      userId,
      stripePaymentIntentId: "pi_route_async",
      stripeCheckoutSessionId: "cs_route_async",
      stripeEventId: "evt_checkout_async_success",
      creditGrantId: "grant_route",
      catalogId: "interview_pass",
      amountInCents: 900,
      currency: "usd",
      status: "succeeded",
      tier: "interview_pass",
    };
    state.checkoutSession = authoritativeCheckoutSession({
      id: "cs_route_async",
      client_reference_id: userId,
      metadata: { userId, catalogId: "interview_pass" },
      customer: "cus_route_async",
      payment_intent: "pi_route_async",
      amount_total: 900,
    });
    state.selectResponses.push([], [persisted]);

    const response = await POST(
      request({
        id: "evt_checkout_async_success",
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: "cs_route_async",
            object: "checkout.session",
            mode: "payment",
            client_reference_id: userId,
            metadata: { userId, catalogId: "interview_pass" },
            customer: "cus_route_async",
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(state.retrieveCheckoutSession).toHaveBeenCalledWith(
      "cs_route_async",
      { expand: ["line_items"] }
    );
    expect(state.grantCalls).toEqual([
      {
        userId,
        catalogId: "interview_pass",
        source: "checkout",
        sourceId: "cs_route_async",
        idempotencyKey: "stripe:checkout:cs_route_async:interview_pass",
      },
    ]);
    expect(state.ownershipClaims).toEqual([
      { customerId: "cus_route_async", userId },
    ]);
    expect(state.payments).toContainEqual(persisted);
  });

  it("reconciles delayed Checkout success after deletion without granting or refunding", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    state.tombstoneFingerprints.add(
      fingerprintStripeSubject("cus_route_async_deleted")!
    );

    const response = await POST(
      request({
        id: "evt_checkout_async_deleted",
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: "cs_route_async_deleted",
            object: "checkout.session",
            status: "complete",
            mode: "payment",
            client_reference_id: userId,
            metadata: { userId, catalogId: "interview_pass" },
            customer: "cus_route_async_deleted",
            payment_status: "paid",
            payment_intent: "pi_route_async_deleted",
          },
        },
      })
    );

    expect(await response.json()).toEqual({
      received: true,
      status: "deleted_checkout_reconciled",
    });
    expect(state.deletedCustomerIds).toEqual(["cus_route_async_deleted"]);
    expect(state.retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(state.ownershipClaims).toHaveLength(0);
    expect(state.grantCalls).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
    expect(state.logs[0]).toMatchObject({
      status: "processed",
      payload: "{}",
      lastError: null,
    });
  });

  it("acknowledges async payment failure without provider or credit mutation", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    state.selectResponses.push([]);

    const response = await POST(
      request({
        id: "evt_checkout_async_failure",
        type: "checkout.session.async_payment_failed",
        data: {
          object: {
            id: "cs_route_async_failure",
            object: "checkout.session",
            mode: "payment",
            client_reference_id: userId,
            metadata: { userId, catalogId: "interview_pass" },
            customer: null,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(state.retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(state.grantCalls).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
  });

  it("leaves subscription Checkout events to subscription and invoice handlers", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    state.selectResponses.push([]);

    const response = await POST(
      request({
        id: "evt_subscription_checkout",
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: "cs_subscription_route",
            object: "checkout.session",
            mode: "subscription",
            client_reference_id: userId,
            metadata: { userId, catalogId: "starter" },
            customer: null,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(state.retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(state.grantCalls).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
  });

  it("accepts a newer cross-resource creation and retires the prior identity", async () => {
    state.selectResponses.push(
      [],
      [],
      [
        subscriptionRow({
          stripeSubscriptionId: "sub_old",
          status: "canceled",
          stripeResourceCreatedAt: new Date(900_000),
          stripeResourceCreatedEventTimestamp: new Date(900_000),
          stripeResourceCreatedEventId: "evt_old_created",
          lastEventTimestamp: new Date(1_000_000),
          lastEventPriority: 40,
          lastEventId: "evt_old_deleted",
        }),
      ]
    );

    const response = await POST(
      request(
        subscriptionCreatedEvent("evt_new_created", "sub_new", 1_000, 1_000)
      )
    );

    expect(response.status).toBe(200);
    expect(state.subscriptionWrites).toHaveLength(1);
    expect(state.subscriptionWrites[0]).toMatchObject({
      stripeSubscriptionId: "sub_new",
      stripeResourceCreatedAt: new Date(1_000_000),
      stripeResourceCreatedEventTimestamp: new Date(1_000_000),
      stripeResourceCreatedEventId: "evt_new_created",
    });
  });

  it("acknowledges but rejects delayed creation for a retired resource", async () => {
    state.selectResponses.push(
      [],
      [],
      [
        subscriptionRow({
          stripeSubscriptionId: "sub_new",
          status: "canceled",
          stripeResourceCreatedAt: new Date(1_000_000),
          stripeResourceCreatedEventTimestamp: new Date(1_000_000),
          stripeResourceCreatedEventId: "evt_new_created",
          retiredStripeSubscriptionIds: ["sub_old"],
        }),
      ]
    );

    const response = await POST(
      request(
        subscriptionCreatedEvent(
          "evt_old_created_delayed",
          "sub_old",
          900,
          1_100
        )
      )
    );

    expect(response.status).toBe(200);
    expect(state.subscriptionWrites).toHaveLength(0);
    expect(state.logs[0]).toMatchObject({ status: "processed" });
  });

  it("retries a CAS loss against an active winner and converges to maximal proof", async () => {
    const old = subscriptionRow({
      stripeSubscriptionId: "sub_old",
      status: "canceled",
      version: 1,
      stripeResourceCreatedAt: new Date(900_000),
      stripeResourceCreatedEventTimestamp: new Date(900_000),
      stripeResourceCreatedEventId: "evt_old_created",
    });
    const winner = subscriptionRow({
      stripeSubscriptionId: "sub_first_winner",
      status: "active",
      version: 2,
      stripeResourceCreatedAt: new Date(1_001_000),
      stripeResourceCreatedEventTimestamp: new Date(1_001_000),
      stripeResourceCreatedEventId: "evt_first_winner_created",
      retiredStripeSubscriptionIds: ["sub_old"],
    });
    state.transactionUpdateResults.push(false, true);
    state.selectResponses.push(
      [],
      [{ version: 1 }],
      [old],
      [{ version: 2 }],
      [winner]
    );

    const candidate = subscriptionCreatedEvent(
      "evt_maximal_created",
      "sub_maximal",
      1_002,
      1_002
    );
    const reconciled = await POST(request(candidate));
    expect(reconciled.status).toBe(200);
    expect(state.subscriptionWrites.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_maximal",
      status: "active",
      version: 3,
      stripeResourceCreatedAt: new Date(1_002_000),
    });

    const replay = await POST(request(candidate));
    expect(await replay.json()).toEqual({
      received: true,
      status: "already_processed",
    });
    expect(state.subscriptionWrites).toHaveLength(1);
  });
});

function subscriptionRow(overrides: Record<string, unknown>) {
  return {
    id: "subscription-row",
    userId: "subscription_user",
    version: 4,
    stripeSubscriptionId: "sub_current",
    status: "active",
    stripeResourceCreatedAt: new Date(900_000),
    stripeResourceCreatedEventTimestamp: new Date(900_000),
    stripeResourceCreatedEventId: "evt_current_created",
    retiredStripeSubscriptionIds: [],
    lastEventTimestamp: new Date(900_000),
    lastEventPriority: 30,
    lastEventId: "evt_current_created",
    ...overrides,
  };
}

function subscriptionCreatedEvent(
  id: string,
  subscriptionId: string,
  resourceCreated: number,
  eventCreated: number
) {
  return {
    id,
    type: "customer.subscription.created",
    created: eventCreated,
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        created: resourceCreated,
        customer: "cus_subscription_route",
        metadata: { userId: "subscription_user" },
        status: "active",
        items: {
          data: [
            {
              current_period_start: eventCreated,
              current_period_end: eventCreated + 2_592_000,
              price: {
                id: "price_starter_route",
                recurring: { interval: "month" },
              },
            },
          ],
        },
        trial_end: null,
        canceled_at: null,
        cancel_at_period_end: false,
      },
    },
  };
}

function event(id: string, type: string) {
  return {
    id,
    type,
    data: {
      object: {
        id: "sub_route_test",
        object: "subscription",
        metadata: { userId: "user_route_test" },
      },
    },
  };
}

function request(body: object) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "stripe-signature": "test-signature" },
  });
}

function streamRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    signal,
    duplex: "half",
    headers: { "stripe-signature": "test-signature" },
  } as never);
}

function authoritativeCheckoutSession(overrides: Record<string, unknown> = {}) {
  const userId = "11111111-1111-4111-8111-111111111111";
  return {
    id: "cs_route_authoritative",
    object: "checkout.session",
    status: "complete",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_route_authoritative",
    amount_total: 900,
    currency: "usd",
    customer: null,
    client_reference_id: userId,
    metadata: { userId, catalogId: "interview_pass" },
    line_items: {
      data: [
        {
          id: "li_route_authoritative",
          currency: "usd",
          price: { id: "price_pass_route" },
          quantity: 1,
        },
      ],
      has_more: false,
    },
    ...overrides,
  };
}

function failedInvoiceEvent(
  id: string,
  created: number,
  customer: string | null = null
) {
  return {
    id,
    type: "invoice.payment_failed",
    created,
    data: {
      object: {
        id: "in_failed",
        object: "invoice",
        customer,
        metadata: { userId: "invoice_user" },
        amount_due: 900,
        billing_reason: "subscription_cycle",
        currency: "usd",
        parent: {
          type: "subscription_details",
          subscription_details: {
            subscription: "sub_route_test",
          },
        },
        period_start: created,
        period_end: created + 2_592_000,
        lines: {
          data: [
            { pricing: { price_details: { price: "price_starter_route" } } },
          ],
        },
      },
    },
  };
}

function invoiceSubscriptionRow(periodStart: number) {
  return subscriptionRow({
    userId: "invoice_user",
    stripeSubscriptionId: "sub_route_test",
    currentPeriodStart: new Date(periodStart * 1000),
    currentPeriodEnd: new Date((periodStart + 2_592_000) * 1000),
    lastEventTimestamp: new Date((periodStart - 1) * 1000),
  });
}

function succeededInvoiceEvent(id: string, created: number) {
  const payload = failedInvoiceEvent(id, created);
  payload.type = "invoice.payment_succeeded";
  return {
    ...payload,
    data: {
      object: {
        ...payload.data.object,
        amount_paid: 900,
        hosted_invoice_url: "https://invoice.example.invalid/receipt",
        payments: {
          data: [
            {
              status: "paid",
              payment: {
                payment_intent: "pi_invoice",
                charge: "ch_invoice",
              },
            },
          ],
        },
      },
    },
  };
}

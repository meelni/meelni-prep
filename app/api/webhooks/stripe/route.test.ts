import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  subscriptionWrites: [] as Array<Record<string, unknown>>,
  mappingWrites: [] as Array<Record<string, unknown>>,
  grantCalls: [] as Array<Record<string, unknown>>,
  renewalCalls: [] as Array<Record<string, unknown>>,
  renewalGrantKeys: new Set<string>(),
  invoiceLineListCalls: [] as Array<{
    invoiceId: string;
    params: Record<string, unknown>;
  }>,
  invoiceLinePages: [] as Array<Record<string, unknown>>,
  transactionUpdateResults: [] as boolean[],
  selectResponses: [] as Array<Array<Record<string, unknown>>>,
  transactionSelectResponses: [] as Array<Array<Record<string, unknown>>>,
  lastSelectResponse: [] as Array<Record<string, unknown>>,
  tombstoneFingerprints: new Set<string>(),
  signatureCalls: 0,
  currentEvent: null as Record<string, unknown> | null,
  subscriptionRetrieveResult: null as Record<string, unknown> | null,
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
        if (state.subscriptionRetrieveResult) {
          return state.subscriptionRetrieveResult;
        }
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
    invoices = {
      listLineItems: vi.fn(
        async (invoiceId: string, params: Record<string, unknown>) => {
          state.invoiceLineListCalls.push({ invoiceId, params });
          const page = state.invoiceLinePages.shift();
          if (!page) throw new Error("missing invoice line page fixture");
          return page;
        }
      ),
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
                      : state.transactionSelectResponses.length > 0
                        ? (state.transactionSelectResponses.shift() ?? [])
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
    renewSubscriptionCredits: vi.fn(async (input: Record<string, unknown>) => {
      state.renewalCalls.push(input);
      state.renewalGrantKeys.add(String(input.renewalIdempotencyKey));
      return { grant: { id: "grant_renewal_route" } };
    }),
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
import { POST } from "./route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    state.logs.length = 0;
    state.payments.length = 0;
    state.updates.length = 0;
    state.subscriptionWrites.length = 0;
    state.mappingWrites.length = 0;
    state.grantCalls.length = 0;
    state.renewalCalls.length = 0;
    state.renewalGrantKeys.clear();
    state.invoiceLineListCalls.length = 0;
    state.invoiceLinePages.length = 0;
    state.transactionUpdateResults.length = 0;
    state.selectResponses.length = 0;
    state.transactionSelectResponses.length = 0;
    state.lastSelectResponse = [];
    state.tombstoneFingerprints.clear();
    state.signatureCalls = 0;
    state.currentEvent = null;
    state.subscriptionRetrieveResult = null;
    process.env.VERCEL_ENV = "preview";
    process.env.MEELNI_ENV_PULL_ENVIRONMENT = "preview";
    process.env.STRIPE_SECRET_KEY = "sk_test_route";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_route";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route";
    process.env.STRIPE_INTERVIEW_PASS_PRICE_ID = "price_pass_route";
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_starter_route";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_pro_route";
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

  it("grants subscription credits from the modern line service period when the top-level invoice period is zero-length", async () => {
    const periodStart = 1_783_932_163;
    const periodEnd = 1_786_610_563;
    const succeeded = succeededInvoiceEvent(
      "evt_invoice_modern_period",
      periodStart
    );
    succeeded.data.object.period_end = periodStart;
    (succeeded.data.object.lines.data as Array<Record<string, unknown>>)[0] = {
      parent: {
        type: "subscription_item_details",
        subscription_item_details: {
          proration: false,
          subscription: "sub_route_test",
          subscription_item: "si_route_test",
        },
      },
      period: { start: periodStart, end: periodEnd },
      pricing: { price_details: { price: "price_starter_route" } },
      subscription: "sub_route_test",
    };
    const persistedPayment = {
      userId: "invoice_user",
      stripePaymentIntentId: "pi_invoice",
      stripeInvoiceId: "in_failed",
      stripeChargeId: "ch_invoice",
      creditGrantId: "grant_renewal_route",
      catalogId: "starter",
      amountInCents: 900,
      currency: "usd",
      status: "succeeded",
    };
    state.selectResponses.push(
      [],
      [
        subscriptionRow({
          userId: "invoice_user",
          stripeSubscriptionId: "sub_route_test",
          currentPeriodStart: new Date(periodStart * 1000),
          currentPeriodEnd: new Date(periodEnd * 1000),
          lastEventTimestamp: new Date((periodStart - 1) * 1000),
        }),
      ],
      [persistedPayment]
    );

    expect((await POST(request(succeeded))).status).toBe(200);
    expect(state.payments).toContainEqual(
      expect.objectContaining({
        creditGrantId: "grant_renewal_route",
        periodStart: new Date(periodStart * 1000),
        periodEnd: new Date(periodEnd * 1000),
      })
    );
    expect(state.subscriptionWrites).toContainEqual(
      expect.objectContaining({
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
      })
    );
  });

  it("bootstraps a subscription-create invoice before subscription.created and grants exactly once", async () => {
    const periodStart = 1_783_932_163;
    const created = invoiceFirstSucceededEvent(
      "evt_invoice_first_create",
      periodStart
    );
    state.subscriptionRetrieveResult =
      invoiceFirstProviderSubscription(periodStart);
    const mapping = invoiceFirstMapping();
    const bootstrapped = invoiceFirstSubscriptionRow(periodStart);
    const persistedPayment = invoiceFirstPersistedPayment();
    state.selectResponses.push([]);
    state.transactionSelectResponses.push(
      [],
      [],
      [mapping],
      [bootstrapped],
      [persistedPayment]
    );

    expect((await POST(request(created))).status).toBe(200);
    expect(state.mappingWrites).toContainEqual(
      expect.objectContaining(mapping)
    );
    expect(state.subscriptionWrites).toContainEqual(
      expect.objectContaining({
        userId: "invoice_user",
        stripeCustomerId: "cus_invoice_first",
        stripeSubscriptionId: "sub_route_test",
        stripePriceId: "price_starter_route",
        lastEventPriority: 20,
        lastEventId: "evt_invoice_first_create",
      })
    );
    expect(state.renewalCalls).toHaveLength(1);
    expect(state.payments).toContainEqual(
      expect.objectContaining({
        creditGrantId: "grant_renewal_route",
        stripeInvoiceId: "in_failed",
      })
    );

    const replay = await POST(request(created));
    expect(await replay.json()).toEqual({
      received: true,
      status: "already_processed",
    });
    expect(state.renewalCalls).toHaveLength(1);
  });

  it("bootstraps from a preseeded customer mapping when the subscription row is absent", async () => {
    const periodStart = 1_783_932_163;
    const created = invoiceFirstSucceededEvent(
      "evt_invoice_first_preseeded",
      periodStart,
      "mapped_user"
    );
    state.subscriptionRetrieveResult = invoiceFirstProviderSubscription(
      periodStart,
      "mapped_user"
    );
    const mapping = invoiceFirstMapping("mapped_user");
    state.selectResponses.push([], [{ userId: "mapped_user" }]);
    state.transactionSelectResponses.push(
      [],
      [mapping],
      [mapping],
      [invoiceFirstSubscriptionRow(periodStart, "mapped_user")],
      [invoiceFirstPersistedPayment("mapped_user")]
    );

    expect((await POST(request(created))).status).toBe(200);
    expect(state.mappingWrites).toHaveLength(0);
    expect(state.renewalCalls).toHaveLength(1);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ userId: "mapped_user" })
    );
  });

  it("rejects an active unscoped row before invoice-first mapping or subscription mutation", async () => {
    const periodStart = 1_783_932_163;
    const created = invoiceFirstSucceededEvent(
      "evt_invoice_first_unscoped_active",
      periodStart
    );
    state.subscriptionRetrieveResult =
      invoiceFirstProviderSubscription(periodStart);
    state.selectResponses.push([]);
    state.transactionSelectResponses.push([
      invoiceFirstSubscriptionRow(periodStart, "invoice_user", {
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        tier: "free",
      }),
    ]);

    const response = await POST(request(created));
    expect(response.status).toBe(500);
    expect(state.logs[0]).toMatchObject({
      status: "failed",
      lastError: "billing_subscription_unscoped_state_conflict",
    });
    expect(state.mappingWrites).toHaveLength(0);
    expect(state.subscriptionWrites).toHaveLength(0);
    expect(state.renewalCalls).toHaveLength(0);
  });

  it("fails closed when subscription-create bootstrap conflicts with another local subscription", async () => {
    const periodStart = 1_783_932_163;
    const created = invoiceFirstSucceededEvent(
      "evt_invoice_first_conflict",
      periodStart
    );
    state.subscriptionRetrieveResult =
      invoiceFirstProviderSubscription(periodStart);
    const mapping = invoiceFirstMapping();
    state.selectResponses.push([]);
    state.transactionSelectResponses.push(
      [
        invoiceFirstSubscriptionRow(periodStart, "invoice_user", {
          stripeSubscriptionId: "sub_other",
        }),
      ],
      [mapping],
      [mapping]
    );

    const response = await POST(request(created));
    expect(response.status).toBe(500);
    expect(state.logs[0]).toMatchObject({
      status: "failed",
      lastError: "billing_subscription_resource_conflict",
    });
    expect(state.renewalCalls).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
  });

  it("retries a subscription-cycle invoice when local subscription state is missing", async () => {
    const cycle = succeededInvoiceEvent(
      "evt_invoice_cycle_missing_state",
      1_783_932_163
    );
    state.selectResponses.push([]);
    state.transactionSelectResponses.push([]);

    const response = await POST(request(cycle));
    expect(response.status).toBe(500);
    expect(state.logs[0]).toMatchObject({
      status: "failed",
      lastError: "billing_subscription_state_missing",
    });
    expect(state.renewalCalls).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
  });

  it.each([
    {
      name: "unscoped",
      overrides: { stripeSubscriptionId: null },
      error: "billing_subscription_unscoped_state_conflict",
    },
    {
      name: "unknown resource",
      overrides: { stripeSubscriptionId: "sub_unknown" },
      error: "billing_subscription_resource_conflict",
    },
    {
      name: "customer",
      overrides: { stripeCustomerId: "cus_other" },
      error: "billing_subscription_cycle_binding_conflict",
    },
    {
      name: "price",
      overrides: { stripePriceId: "price_pro_route" },
      error: "billing_subscription_cycle_binding_conflict",
    },
    {
      name: "tier",
      overrides: { tier: "pro" },
      error: "billing_subscription_cycle_binding_conflict",
    },
  ])(
    "fails a cycle before payment on $name state conflict",
    async ({ overrides, error }) => {
      const periodStart = 1_783_932_163;
      state.selectResponses.push([]);
      state.transactionSelectResponses.push([
        invoiceFirstSubscriptionRow(periodStart, "invoice_user", overrides),
      ]);

      const response = await POST(
        request(
          succeededInvoiceEvent(
            `evt_invoice_cycle_${String(overrides.stripeSubscriptionId ?? "binding")}`,
            periodStart
          )
        )
      );
      expect(response.status).toBe(500);
      expect(state.logs[0]).toMatchObject({
        status: "failed",
        lastError: error,
      });
      expect(state.renewalCalls).toHaveLength(0);
      expect(state.payments).toHaveLength(0);
    }
  );

  it("records but does not grant a cycle for a recognized retired subscription", async () => {
    const periodStart = 1_783_932_163;
    const retired = succeededInvoiceEvent(
      "evt_invoice_retired_resource",
      periodStart
    );
    setInvoiceSubscriptionIdentity(retired, "sub_retired");
    const persistedPayment = {
      ...invoiceFirstPersistedPayment(),
      creditGrantId: null,
    };
    state.selectResponses.push([]);
    state.transactionSelectResponses.push(
      [
        invoiceSubscriptionRow(periodStart, {
          stripeSubscriptionId: "sub_current",
          retiredStripeSubscriptionIds: ["sub_retired"],
        }),
      ],
      [persistedPayment]
    );

    expect((await POST(request(retired))).status).toBe(200);
    expect(state.renewalCalls).toHaveLength(0);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ creditGrantId: null, status: "succeeded" })
    );
  });

  it("records but does not grant a historical cycle for the current subscription", async () => {
    const currentStart = 1_783_932_163;
    const oldStart = currentStart - 2_592_000;
    const historical = succeededInvoiceEvent(
      "evt_invoice_historical_cycle",
      oldStart
    );
    const persistedPayment = {
      ...invoiceFirstPersistedPayment(),
      creditGrantId: null,
    };
    state.selectResponses.push([]);
    state.transactionSelectResponses.push(
      [invoiceSubscriptionRow(currentStart)],
      [persistedPayment]
    );

    expect((await POST(request(historical))).status).toBe(200);
    expect(state.renewalCalls).toHaveLength(0);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ creditGrantId: null, status: "succeeded" })
    );
  });

  it("records but does not grant an exact-period cycle for the canceled current subscription", async () => {
    const periodStart = 1_783_932_163;
    const canceled = succeededInvoiceEvent(
      "evt_invoice_canceled_current_cycle",
      periodStart
    );
    const persistedPayment = {
      ...invoiceFirstPersistedPayment(),
      creditGrantId: null,
    };
    state.selectResponses.push([]);
    state.transactionSelectResponses.push(
      [
        invoiceSubscriptionRow(periodStart, {
          status: "canceled",
          canceledAt: new Date((periodStart - 1) * 1_000),
        }),
      ],
      [persistedPayment]
    );

    expect((await POST(request(canceled))).status).toBe(200);
    expect(state.renewalCalls).toHaveLength(0);
    expect(state.subscriptionWrites).toHaveLength(0);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ creditGrantId: null, status: "succeeded" })
    );
  });

  it("converges distinct Event IDs for one successful invoice to one payment and grant", async () => {
    const periodStart = 1_783_932_163;
    const first = succeededInvoiceEvent(
      "evt_invoice_logical_first",
      periodStart
    );
    const replay = succeededInvoiceEvent(
      "evt_invoice_logical_replay",
      periodStart
    );
    const current = invoiceSubscriptionRow(periodStart);
    const persistedPayment = invoiceFirstPersistedPayment();
    state.selectResponses.push([]);
    state.transactionSelectResponses.push([current], [persistedPayment]);
    expect((await POST(request(first))).status).toBe(200);

    state.transactionSelectResponses.push([current], [persistedPayment]);
    const replayResponse = await POST(request(replay));
    expect(await replayResponse.json()).toEqual({
      received: true,
      status: "logical_replay",
    });
    expect(state.payments).toHaveLength(1);
    expect(state.renewalGrantKeys).toEqual(
      new Set(["stripe:invoice:in_failed:starter"])
    );
  });

  it("acknowledges a paid subscription-update proration without granting credits or moving entitlement state", async () => {
    const periodStart = 1_783_932_163;
    const succeeded = succeededInvoiceEvent(
      "evt_invoice_subscription_update",
      periodStart
    );
    succeeded.data.object.billing_reason = "subscription_update";
    (succeeded.data.object.lines.data as Array<Record<string, unknown>>)[0] = {
      parent: {
        type: "subscription_item_details",
        subscription_item_details: {
          proration: true,
          subscription: "sub_route_test",
        },
      },
      period: { start: periodStart, end: periodStart },
      pricing: { price_details: { price: "price_starter_route" } },
      subscription: "sub_route_test",
    };
    const persistedPayment = {
      userId: "invoice_user",
      stripePaymentIntentId: "pi_invoice",
      stripeInvoiceId: "in_failed",
      stripeChargeId: "ch_invoice",
      creditGrantId: null,
      catalogId: "starter",
      amountInCents: 900,
      currency: "usd",
      status: "succeeded",
    };
    state.selectResponses.push(
      [],
      [invoiceSubscriptionRow(periodStart)],
      [persistedPayment]
    );

    const response = await POST(request(succeeded));

    expect(response.status).toBe(200);
    expect(state.payments).toContainEqual(
      expect.objectContaining({
        creditGrantId: null,
        catalogId: "starter",
        status: "succeeded",
      })
    );
    expect(state.subscriptionWrites).toHaveLength(0);
  });

  it("grants a legacy pre-Basil subscription-cycle replay without weakening subscription binding", async () => {
    const periodStart = 1_783_932_163;
    const periodEnd = periodStart + 2_592_000;
    const succeeded = succeededInvoiceEvent(
      "evt_invoice_legacy_period",
      periodStart
    );
    delete (succeeded.data.object as Record<string, unknown>).parent;
    (succeeded.data.object as Record<string, unknown>).subscription =
      "sub_route_test";
    (succeeded.data.object.lines.data as Array<Record<string, unknown>>)[0] = {
      id: "il_legacy_route",
      price: { id: "price_starter_route" },
      proration: false,
      period: { start: periodStart, end: periodEnd },
      subscription: "sub_route_test",
    };
    const persistedPayment = {
      userId: "invoice_user",
      stripePaymentIntentId: "pi_invoice",
      stripeInvoiceId: "in_failed",
      stripeChargeId: "ch_invoice",
      creditGrantId: "grant_renewal_route",
      catalogId: "starter",
      amountInCents: 900,
      currency: "usd",
      status: "succeeded",
    };
    state.selectResponses.push(
      [],
      [invoiceSubscriptionRow(periodStart)],
      [persistedPayment]
    );

    expect((await POST(request(succeeded))).status).toBe(200);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ creditGrantId: "grant_renewal_route" })
    );
  });

  it("fails a renewal invoice when paid service-period evidence is invalid", async () => {
    const periodStart = 1_783_932_163;
    const succeeded = succeededInvoiceEvent(
      "evt_invoice_invalid_renewal_period",
      periodStart
    );
    succeeded.data.object.period_end = periodStart;
    (succeeded.data.object.lines.data as Array<Record<string, unknown>>)[0] = {
      parent: {
        type: "subscription_item_details",
        subscription_item_details: {
          proration: false,
          subscription: "sub_route_test",
        },
      },
      period: { start: periodStart, end: periodStart },
      pricing: { price_details: { price: "price_starter_route" } },
      subscription: "sub_route_test",
    };
    state.selectResponses.push([]);

    expect((await POST(request(succeeded))).status).toBe(500);
    expect(state.payments).toHaveLength(0);
    expect(state.grantCalls).toHaveLength(0);
    expect(state.logs[0]).toMatchObject({ status: "failed" });
  });

  it("retrieves all invoice line pages before granting subscription credits", async () => {
    const periodStart = 1_783_932_163;
    const periodEnd = periodStart + 2_592_000;
    const succeeded = succeededInvoiceEvent(
      "evt_invoice_paginated_lines",
      periodStart
    );
    (succeeded.data.object as Record<string, unknown>).lines = {
      data: [{ id: "il_embedded_partial" }],
      has_more: true,
    };
    state.invoiceLinePages.push(
      {
        data: [
          {
            id: "il_proration_route",
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                proration: true,
                subscription: "sub_route_test",
              },
            },
            period: { start: periodStart, end: periodEnd },
            pricing: { price_details: { price: "price_starter_route" } },
            subscription: "sub_route_test",
          },
        ],
        has_more: true,
      },
      {
        data: [
          {
            id: "il_renewal_route",
            parent: {
              type: "subscription_item_details",
              subscription_item_details: {
                proration: false,
                subscription: "sub_route_test",
              },
            },
            period: { start: periodStart, end: periodEnd },
            pricing: { price_details: { price: "price_starter_route" } },
            subscription: "sub_route_test",
          },
        ],
        has_more: false,
      }
    );
    const persistedPayment = {
      userId: "invoice_user",
      stripePaymentIntentId: "pi_invoice",
      stripeInvoiceId: "in_failed",
      stripeChargeId: "ch_invoice",
      creditGrantId: "grant_renewal_route",
      catalogId: "starter",
      amountInCents: 900,
      currency: "usd",
      status: "succeeded",
    };
    state.selectResponses.push(
      [],
      [invoiceSubscriptionRow(periodStart)],
      [persistedPayment]
    );

    expect((await POST(request(succeeded))).status).toBe(200);
    expect(state.invoiceLineListCalls).toEqual([
      { invoiceId: "in_failed", params: { limit: 100 } },
      {
        invoiceId: "in_failed",
        params: { limit: 100, starting_after: "il_proration_route" },
      },
    ]);
    expect(state.payments).toContainEqual(
      expect.objectContaining({ creditGrantId: "grant_renewal_route" })
    );
  });

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
            client_reference_id: "user_route",
            metadata: {
              userId: "user_route",
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

  it("rejects an unpaid async checkout before every fulfillment mutation", async () => {
    state.selectResponses.push([]);
    const response = await POST(
      request({
        id: "evt_checkout_unpaid",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_route_unpaid",
            object: "checkout.session",
            client_reference_id: "user_route",
            metadata: {
              userId: "user_route",
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

    expect(response.status).toBe(500);
    expect(state.logs[0]).toMatchObject({
      status: "failed",
      lastError: "checkout_payment_not_settled",
    });
    expect(state.grantCalls).toHaveLength(0);
    expect(state.mappingWrites).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
    expect(state.subscriptionWrites).toHaveLength(0);
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
    stripeCustomerId: "cus_invoice",
    stripePriceId: "price_starter_route",
    tier: "starter",
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

function invoiceSubscriptionRow(
  periodStart: number,
  overrides: Record<string, unknown> = {}
) {
  return subscriptionRow({
    userId: "invoice_user",
    stripeSubscriptionId: "sub_route_test",
    currentPeriodStart: new Date(periodStart * 1000),
    currentPeriodEnd: new Date((periodStart + 2_592_000) * 1000),
    lastEventTimestamp: new Date((periodStart - 1) * 1000),
    ...overrides,
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
        customer: "cus_invoice",
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

function invoiceFirstSucceededEvent(
  id: string,
  periodStart: number,
  userId = "invoice_user"
) {
  const invoice = succeededInvoiceEvent(id, periodStart);
  const object = invoice.data.object as unknown as Record<string, unknown>;
  object.customer = "cus_invoice_first";
  object.metadata = {};
  object.billing_reason = "subscription_create";
  object.lines = {
    data: [
      {
        id: "il_invoice_first",
        parent: {
          type: "subscription_item_details",
          subscription_item_details: {
            proration: false,
            subscription: "sub_route_test",
            subscription_item: "si_invoice_first",
          },
        },
        period: {
          start: periodStart,
          end: periodStart + 2_592_000,
        },
        pricing: { price_details: { price: "price_starter_route" } },
        subscription: "sub_route_test",
      },
    ],
  };
  if (userId !== "invoice_user") {
    object.metadata = { userId };
  }
  return invoice;
}

function setInvoiceSubscriptionIdentity(
  invoice: ReturnType<typeof succeededInvoiceEvent>,
  subscriptionId: string
) {
  const object = invoice.data.object as unknown as {
    parent: {
      subscription_details: { subscription: string };
    };
    lines: {
      data: Array<{
        parent?: {
          subscription_item_details?: { subscription?: string };
        };
        period?: { end: number; start: number };
        subscription?: string;
      }>;
    };
    period_end: number;
    period_start: number;
  };
  object.parent.subscription_details.subscription = subscriptionId;
  for (const line of object.lines.data) {
    line.subscription = subscriptionId;
    line.period ??= {
      start: object.period_start,
      end: object.period_end,
    };
    if (line.parent?.subscription_item_details) {
      line.parent.subscription_item_details.subscription = subscriptionId;
    }
  }
}

function invoiceFirstProviderSubscription(
  periodStart: number,
  userId = "invoice_user"
) {
  return {
    id: "sub_route_test",
    object: "subscription",
    created: periodStart - 10,
    customer: "cus_invoice_first",
    metadata: { userId },
    status: "active",
    items: {
      data: [
        {
          id: "si_invoice_first",
          subscription: "sub_route_test",
          quantity: 1,
          current_period_start: periodStart,
          current_period_end: periodStart + 2_592_000,
          price: {
            id: "price_starter_route",
            recurring: { interval: "month" },
          },
        },
      ],
      has_more: false,
    },
    trial_end: null,
    canceled_at: null,
    cancel_at_period_end: false,
  };
}

function invoiceFirstMapping(userId = "invoice_user") {
  return {
    stripeCustomerId: "cus_invoice_first",
    stripeSubscriptionId: "sub_route_test",
    userId,
  };
}

function invoiceFirstSubscriptionRow(
  periodStart: number,
  userId = "invoice_user",
  overrides: Record<string, unknown> = {}
) {
  return subscriptionRow({
    userId,
    tier: "starter",
    stripeCustomerId: "cus_invoice_first",
    stripeSubscriptionId: "sub_route_test",
    stripePriceId: "price_starter_route",
    currentPeriodStart: new Date(periodStart * 1_000),
    currentPeriodEnd: new Date((periodStart + 2_592_000) * 1_000),
    lastEventTimestamp: new Date(periodStart * 1_000),
    lastEventPriority: 20,
    ...overrides,
  });
}

function invoiceFirstPersistedPayment(userId = "invoice_user") {
  return {
    userId,
    stripePaymentIntentId: "pi_invoice",
    stripeInvoiceId: "in_failed",
    stripeChargeId: "ch_invoice",
    creditGrantId: "grant_renewal_route",
    catalogId: "starter",
    amountInCents: 900,
    currency: "usd",
    status: "succeeded",
  };
}

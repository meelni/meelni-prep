import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  selectResponses: [] as Array<Array<Record<string, unknown>>>,
  tombstoneFingerprints: new Set<string>(),
  signatureCalls: 0,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent(body: string) {
        state.signatureCalls += 1;
        return JSON.parse(body);
      },
    };
    invoicePayments = {
      list: vi.fn(async () => ({ data: [] })),
    };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            state.selectResponses.length > 0
              ? (state.selectResponses.shift() ?? [])
              : state.logs.slice(0, 1),
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
  },
}));

vi.mock("@/lib/billing/credits", () => ({
  createCreditLedgerService: vi.fn(() => ({
    grantCredits: vi.fn(async () => ({ grant: { id: "grant_route" } })),
    renewSubscriptionCredits: vi.fn(async () => ({
      grant: { id: "grant_renewal_route" },
    })),
  })),
}));

vi.mock("@/lib/billing/credit-ledger-store", () => ({
  createDrizzleCreditLedgerStore: vi.fn(() => ({})),
}));

vi.mock("@/lib/db/account-deletions", () => ({
  findStripeDeletionTombstoneFingerprint: vi.fn(
    async (fingerprints: string[]) =>
      fingerprints.find((fingerprint) =>
        state.tombstoneFingerprints.has(fingerprint)
      ) ?? null
  ),
}));

import { fingerprintStripeSubject } from "@/lib/billing/stripe-privacy";
import { POST } from "./route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    state.logs.length = 0;
    state.payments.length = 0;
    state.updates.length = 0;
    state.selectResponses.length = 0;
    state.tombstoneFingerprints.clear();
    state.signatureCalls = 0;
    process.env.STRIPE_SECRET_KEY = "sk_test_route";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route";
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_starter_route";
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
      expect(state.logs[0]).toMatchObject({
        status: "failed",
        lastError: "stripe_customer_owner_mismatch",
      });
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
    state.selectResponses.push([], [], [persistedPayment]);
    expect(
      (
        await POST(
          request(failedInvoiceEvent("evt_failed_first", firstCreated))
        )
      ).status
    ).toBe(200);

    state.selectResponses.push([state.logs[0]!], [], [persistedPayment]);
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
        state.selectResponses.push([], [], [failedPayment]);
        expect((await POST(request(failed))).status).toBe(200);
        state.selectResponses.push([], [succeededPayment]);
        expect((await POST(request(succeeded))).status).toBe(200);
      } else {
        state.selectResponses.push([], [succeededPayment]);
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
});

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

function streamRequest(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
) {
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

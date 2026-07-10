import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  event: {} as Record<string, unknown>,
  cancel: vi.fn(),
  deleteCustomer: vi.fn(),
  retrieveCharge: vi.fn(),
  retrieveInvoice: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  refund: vi.fn(),
  listRefunds: vi.fn(),
  listInvoicePayments: vi.fn(),
  grantCredits: vi.fn(),
  insertValues: [] as Array<Record<string, unknown>>,
  updateSets: [] as Array<Record<string, unknown>>,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: vi.fn(() => state.event) };
    checkout = { sessions: { expire: vi.fn() } };
    subscriptions = { cancel: state.cancel };
    customers = { del: state.deleteCustomer };
    charges = { retrieve: state.retrieveCharge };
    invoices = { retrieve: state.retrieveInvoice };
    invoicePayments = { list: state.listInvoicePayments };
    paymentIntents = { retrieve: state.retrievePaymentIntent };
    refunds = { create: state.refund, list: state.listRefunds };
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        state.insertValues.push(value);
        return Promise.resolve(undefined);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: Record<string, unknown>) => {
        state.updateSets.push(value);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
  },
}));
vi.mock("@/lib/db/account-deletions", () => ({
  hasAccountDeletionTombstone: vi.fn(),
  getAccountDeletionRequestByStripeFingerprint: vi
    .fn()
    .mockResolvedValue(undefined),
  getAccountDeletionRequest: vi.fn().mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    stripeSubjects: [],
    attempts: 1,
  }),
  clearLateStripeDeletionSubjects: vi.fn().mockResolvedValue(true),
  markLateStripeReconciliationFailed: vi.fn().mockResolvedValue(undefined),
  recordLateStripeDeletionSubjects: vi.fn().mockResolvedValue(true),
  redactStripeEventLogs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/billing/credits", () => ({
  createCreditLedgerService: vi.fn(() => ({
    grantCredits: state.grantCredits,
  })),
}));
vi.mock("@/lib/billing/credit-ledger-store", () => ({
  createDrizzleCreditLedgerStore: vi.fn(() => ({})),
}));
vi.mock("@/lib/billing/stripe-customer-ownership", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/billing/stripe-customer-ownership")
    >();
  return {
    ...actual,
    getMappedStripeCustomerUserId: vi
      .fn()
      .mockResolvedValue("11111111-1111-4111-8111-111111111111"),
  };
});

import {
  clearLateStripeDeletionSubjects,
  getAccountDeletionRequestByStripeFingerprint,
  hasAccountDeletionTombstone,
  markLateStripeReconciliationFailed,
  recordLateStripeDeletionSubjects,
} from "@/lib/db/account-deletions";
import { getMappedStripeCustomerUserId } from "@/lib/billing/stripe-customer-ownership";
import { POST } from "./route";

describe("Stripe webhook account-deletion fulfillment barrier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.insertValues.length = 0;
    state.updateSets.length = 0;
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fixture";
    state.event = checkoutEvent();
    state.cancel.mockResolvedValue({ id: "sub_test" });
    state.deleteCustomer.mockResolvedValue({ id: "cus_test", deleted: true });
    state.retrieveCharge.mockResolvedValue({
      id: "ch_test",
      amount: 2_900,
      amount_refunded: 2_900,
      refunded: true,
    });
    state.retrieveInvoice.mockResolvedValue({
      id: "in_test_deleted_subscription",
      amount_paid: 0,
      currency: "usd",
    });
    state.refund.mockImplementation(async (input: Record<string, unknown>) => {
      return {
        id: "re_test",
        amount: input.amount ?? 2_900,
        status: "succeeded",
        metadata: input.metadata ?? {},
      };
    });
    state.listRefunds.mockResolvedValue({ data: [], has_more: false });
    state.listInvoicePayments.mockImplementation(
      async (params: Record<string, unknown>) =>
        String(params.invoice).includes("subscription")
          ? { data: [], has_more: false }
          : {
              data: [
                invoicePayment({
                  id: "inpay_test_deleted_invoice",
                  amount: 2_900,
                  paymentIntentId: "pi_test_deleted_invoice",
                }),
              ],
              has_more: false,
            }
    );
    state.retrievePaymentIntent.mockResolvedValue({
      id: "pi_test",
      latest_charge: {
        id: "ch_test",
        amount: 2_900,
        amount_refunded: 2_900,
        refunded: true,
      },
    });
    state.grantCredits.mockResolvedValue({ grant: { id: "grant_test" } });
    vi.mocked(getAccountDeletionRequestByStripeFingerprint).mockResolvedValue(
      undefined
    );
    vi.mocked(getMappedStripeCustomerUserId).mockResolvedValue(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("reconciles a checkout already associated with a tombstone without granting", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted_checkout_reconciled",
    });
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("rejects a genuine checkout whose metadata and client reference disagree", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = checkoutEvent();
    const object = state.event.data as { object: Record<string, unknown> };
    object.object.client_reference_id = "22222222-2222-4222-8222-222222222222";

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.cancel).not.toHaveBeenCalled();
    expect(state.refund).not.toHaveBeenCalled();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(recordLateStripeDeletionSubjects).not.toHaveBeenCalled();
  });

  it("rejects metadata that conflicts with the authoritative customer mapping", async () => {
    vi.mocked(getMappedStripeCustomerUserId).mockResolvedValue(
      "22222222-2222-4222-8222-222222222222"
    );
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = subscriptionEvent();

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.cancel).not.toHaveBeenCalled();
    expect(state.refund).not.toHaveBeenCalled();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(recordLateStripeDeletionSubjects).not.toHaveBeenCalled();
  });

  it("rechecks immediately before fulfillment and redacts a newly tombstoned event", async () => {
    vi.mocked(hasAccountDeletionTombstone)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(state.insertValues).toContainEqual(
      expect.objectContaining({ payload: "{}" })
    );
    expect(JSON.stringify(state.insertValues)).not.toContain(
      "cus_test_deleted_checkout"
    );
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ payload: "{}" })
    );
  });

  it("turns a tombstone won during the credit transaction into reconciliation", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    state.grantCredits.mockRejectedValue(new Error("account_deletion_pending"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.grantCredits).toHaveBeenCalledOnce();
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("cancels a deleted subscription event without relying on checkout ordering", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = subscriptionEvent();

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted_subscription_reconciled",
    });
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("refunds a paid subscription-first event before deleting its customer", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = subscriptionEvent();
    state.retrieveInvoice.mockResolvedValue({
      id: "in_test_deleted_subscription",
      amount_paid: 2_900,
      currency: "usd",
    });
    state.listInvoicePayments.mockResolvedValue({
      data: [
        invoicePayment({
          id: "inpay_test_deleted_subscription",
          amount: 2_900,
          paymentIntentId: "pi_test_deleted_subscription",
        }),
      ],
      has_more: false,
    });

    const calls: string[] = [];
    state.refund.mockImplementation(async () => {
      calls.push("refund");
      return { id: "re_subscription", amount: 2_900, status: "succeeded" };
    });
    state.deleteCustomer.mockImplementation(async () => {
      calls.push("customer");
      return { id: "cus_test_deleted_subscription", deleted: true };
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(calls).toEqual(["refund", "customer"]);
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledTimes(2);
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("keeps a subscription-first customer recoverable without invoice evidence", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = subscriptionEvent({ latest_invoice: null });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(clearLateStripeDeletionSubjects).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({
        status: "failed",
        lastError: "deleted_subscription_manual_reconciliation_required",
      })
    );
  });

  it("recovers the tombstone owner from a subject fingerprint when metadata is absent", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    vi.mocked(getAccountDeletionRequestByStripeFingerprint).mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      stripeSubjects: [],
      attempts: 1,
    });
    state.event = subscriptionEvent({ metadata: {} });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.any(Array)
    );
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("refunds a deleted invoice event without relying on checkout ordering", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent();

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted_invoice_reconciled",
    });
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("refunds every paid invoice allocation before customer deletion", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent();
    state.listInvoicePayments.mockResolvedValue({
      data: [
        invoicePayment({
          id: "inpay_first",
          amount: 1_000,
          paymentIntentId: "pi_test_deleted_invoice",
        }),
        invoicePayment({
          id: "inpay_second",
          amount: 1_900,
          chargeId: "ch_test_deleted_invoice",
        }),
      ],
      has_more: false,
    });
    const calls: string[] = [];
    state.refund.mockImplementation(async (input: Record<string, unknown>) => {
      calls.push(`refund:${input.amount}`);
      return {
        id: `re_${input.amount}`,
        amount: input.amount,
        status: "succeeded",
        metadata: input.metadata,
      };
    });
    state.deleteCustomer.mockImplementation(async () => {
      calls.push("customer");
      return { id: "cus_test_deleted_invoice", deleted: true };
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(calls).toEqual(["refund:1000", "refund:1900", "customer"]);
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.arrayContaining([
        expect.objectContaining({ providerId: "pi_test_deleted_invoice" }),
        expect.objectContaining({ providerId: "ch_test_deleted_invoice" }),
      ])
    );
  });

  it("keeps a paid deleted invoice failed when no refundable payment is available", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent({ payments: { data: [] } });
    state.listInvoicePayments.mockResolvedValue({
      data: [],
      has_more: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.refund).not.toHaveBeenCalled();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({
        status: "failed",
        payload: "{}",
        lastError: "deleted_invoice_manual_reconciliation_required",
      })
    );
  });

  it("fails closed on a paid PaymentRecord allocation", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent();
    state.listInvoicePayments.mockResolvedValue({
      data: [
        {
          ...invoicePayment({
            id: "inpay_record",
            amount: 2_900,
            paymentIntentId: "pi_unused",
          }),
          payment: {
            type: "payment_record",
            payment_record: "pyr_test",
          },
        },
      ],
      has_more: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.refund).not.toHaveBeenCalled();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(clearLateStripeDeletionSubjects).not.toHaveBeenCalled();
  });

  it("retains late provider references when customer cleanup fails, then clears them on retry", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.deleteCustomer
      .mockRejectedValueOnce(Object.assign(new Error("provider failed"), {}))
      .mockResolvedValueOnce({ id: "cus_test", deleted: true });

    const failed = await POST(request());
    const recovered = await POST(request());

    expect(failed.status).toBe(500);
    expect(recovered.status).toBe(200);
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledTimes(2);
    expect(markLateStripeReconciliationFailed).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({
        status: "failed",
        payload: "{}",
        lastError: "deleted_customer_cleanup_failed",
      })
    );
  });

  it("marks an early cancellation failure recoverable before customer deletion, then completes on retry", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = subscriptionEvent();
    state.cancel
      .mockRejectedValueOnce(new Error("cancel unavailable"))
      .mockResolvedValueOnce({ id: "sub_test" });

    const failed = await POST(request());
    const recovered = await POST(request());

    expect(failed.status).toBe(500);
    expect(recovered.status).toBe(200);
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledTimes(2);
    expect(markLateStripeReconciliationFailed).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("accepts a replay only after a manually completed full refund", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.refund.mockRejectedValue(
      Object.assign(new Error("already refunded"), {
        code: "charge_already_refunded",
      })
    );
    state.listRefunds.mockResolvedValue({
      data: [{ id: "re_manual", amount: 2_900, status: "succeeded" }],
      has_more: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.retrievePaymentIntent).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("completes an operator partial refund and verifies the full provider total", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.refund.mockResolvedValue({
      id: "re_remaining",
      amount: 1_900,
      status: "succeeded",
    });
    state.listRefunds.mockResolvedValue({
      data: [{ id: "re_partial", amount: 1_000, status: "succeeded" }],
      has_more: false,
    });
    state.retrievePaymentIntent.mockResolvedValue({
      id: "pi_test",
      latest_charge: {
        id: "ch_test",
        amount: 2_900,
        amount_refunded: 2_900,
        refunded: true,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.retrievePaymentIntent).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("accepts a fully refunded charge replay after verifying provider state", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent({
      payments: {
        data: [
          {
            status: "paid",
            payment: { charge: "ch_test_deleted_invoice" },
          },
        ],
      },
    });
    state.listInvoicePayments.mockResolvedValue({
      data: [
        invoicePayment({
          id: "inpay_test_deleted_invoice",
          amount: 2_900,
          chargeId: "ch_test_deleted_invoice",
        }),
      ],
      has_more: false,
    });
    state.refund.mockRejectedValue(
      Object.assign(new Error("already refunded"), {
        code: "charge_already_refunded",
      })
    );
    state.listRefunds.mockResolvedValue({
      data: [{ id: "re_manual", amount: 2_900, status: "succeeded" }],
      has_more: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.retrieveCharge).toHaveBeenCalledWith(
      "ch_test_deleted_invoice"
    );
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("treats an already deleted customer as successful cleanup", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.deleteCustomer.mockRejectedValue(
      Object.assign(new Error("missing"), {
        code: "resource_missing",
      })
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(markLateStripeReconciliationFailed).not.toHaveBeenCalled();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("keeps an incomplete refund failed when Stripe does not complete the remainder", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.refund.mockRejectedValue(
      Object.assign(new Error("already partially refunded"), {
        code: "charge_already_refunded",
      })
    );
    state.retrievePaymentIntent.mockResolvedValue({
      id: "pi_test",
      latest_charge: {
        id: "ch_test",
        amount: 2_900,
        amount_refunded: 1_000,
        refunded: false,
      },
    });
    state.listRefunds.mockResolvedValue({
      data: [{ id: "re_partial", amount: 1_000, status: "succeeded" }],
      has_more: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledOnce();
    expect(markLateStripeReconciliationFailed).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "failed", payload: "{}" })
    );
  });

  it("rejects customer cleanup when a successful refund response is still partial", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.retrievePaymentIntent.mockResolvedValue({
      id: "pi_test",
      latest_charge: {
        id: "ch_test",
        amount: 2_900,
        amount_refunded: 1_000,
        refunded: false,
      },
    });
    state.refund.mockResolvedValue({
      id: "re_partial",
      amount: 1_000,
      status: "succeeded",
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.refund).toHaveBeenCalledOnce();
    expect(state.retrievePaymentIntent).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).not.toHaveBeenCalled();
    expect(markLateStripeReconciliationFailed).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).not.toHaveBeenCalled();
  });

  it("retains recovery subjects while a refund is pending, then clears after it succeeds", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.refund.mockResolvedValue({
      id: "re_pending",
      amount: 2_900,
      status: "pending",
    });
    state.listRefunds
      .mockResolvedValueOnce({ data: [], has_more: false })
      .mockResolvedValueOnce({
        data: [{ id: "re_pending", amount: 2_900, status: "pending" }],
        has_more: false,
      })
      .mockResolvedValueOnce({
        data: [{ id: "re_pending", amount: 2_900, status: "succeeded" }],
        has_more: false,
      });

    const pending = await POST(request());
    const succeeded = await POST(request());

    expect(pending.status).toBe(500);
    expect(succeeded.status).toBe(200);
    expect(state.refund).toHaveBeenCalledOnce();
    expect(markLateStripeReconciliationFailed).toHaveBeenCalledOnce();
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });

  it("uses a new deterministic attempt after a pending refund fails", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.refund
      .mockResolvedValueOnce({
        id: "re_pending",
        amount: 2_900,
        status: "pending",
      })
      .mockResolvedValueOnce({
        id: "re_retry",
        amount: 2_900,
        status: "succeeded",
      });
    state.listRefunds
      .mockResolvedValueOnce({ data: [], has_more: false })
      .mockResolvedValueOnce({
        data: [{ id: "re_pending", amount: 2_900, status: "pending" }],
        has_more: false,
      })
      .mockResolvedValueOnce({
        data: [{ id: "re_pending", amount: 2_900, status: "failed" }],
        has_more: false,
      })
      .mockResolvedValueOnce({
        data: [{ id: "re_pending", amount: 2_900, status: "failed" }],
        has_more: false,
      });

    const pending = await POST(request());
    const recovered = await POST(request());

    expect(pending.status).toBe(500);
    expect(recovered.status).toBe(200);
    expect(state.refund).toHaveBeenCalledTimes(2);
    const firstKey = state.refund.mock.calls[0]?.[1]?.idempotencyKey;
    const retryKey = state.refund.mock.calls[1]?.[1]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBeTruthy();
    expect(retryKey).not.toBe(firstKey);
    expect(state.deleteCustomer).toHaveBeenCalledOnce();
    expect(clearLateStripeDeletionSubjects).toHaveBeenCalledOnce();
  });
});

function request() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "signed-body",
  });
}

function checkoutEvent() {
  return {
    id: "evt_test_deleted_checkout",
    type: "checkout.session.completed",
    created: 1_788_000_000,
    data: {
      object: {
        id: "cs_test_deleted_checkout",
        object: "checkout.session",
        status: "complete",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_test_deleted_checkout",
        invoice: null,
        subscription: null,
        customer: "cus_test_deleted_checkout",
        client_reference_id: "11111111-1111-4111-8111-111111111111",
        metadata: {
          userId: "11111111-1111-4111-8111-111111111111",
          catalogId: "interview_pass",
        },
      },
    },
  };
}

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_test_deleted_subscription",
    type: "customer.subscription.created",
    created: 1_788_000_001,
    data: {
      object: {
        id: "sub_test_deleted",
        object: "subscription",
        customer: "cus_test_deleted_subscription",
        latest_invoice: "in_test_deleted_subscription",
        metadata: {
          userId: "11111111-1111-4111-8111-111111111111",
        },
        ...overrides,
      },
    },
  };
}

function invoiceEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_test_deleted_invoice",
    type: "invoice.payment_succeeded",
    created: 1_788_000_002,
    data: {
      object: {
        id: "in_test_deleted",
        object: "invoice",
        amount_paid: 2_900,
        currency: "usd",
        customer: "cus_test_deleted_invoice",
        metadata: {},
        parent: {
          type: "subscription_details",
          subscription_details: {
            subscription: "sub_test_deleted_invoice",
            metadata: {
              userId: "11111111-1111-4111-8111-111111111111",
            },
          },
        },
        payments: {
          data: [
            {
              status: "paid",
              payment: {
                payment_intent: "pi_test_deleted_invoice",
              },
            },
          ],
        },
        ...overrides,
      },
    },
  };
}

function invoicePayment(input: {
  amount: number;
  chargeId?: string;
  id: string;
  paymentIntentId?: string;
}) {
  return {
    id: input.id,
    object: "invoice_payment",
    amount_paid: input.amount,
    amount_requested: input.amount,
    created: 1_788_000_000,
    currency: "usd",
    invoice: "in_test",
    is_default: false,
    livemode: false,
    payment: input.paymentIntentId
      ? { type: "payment_intent", payment_intent: input.paymentIntentId }
      : { type: "charge", charge: input.chargeId },
    status: "paid",
    status_transitions: { canceled_at: null, paid_at: 1_788_000_000 },
  };
}

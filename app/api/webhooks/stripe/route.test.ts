import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  event: {} as Record<string, unknown>,
  cancel: vi.fn(),
  retrieveInvoice: vi.fn(),
  refund: vi.fn(),
  grantCredits: vi.fn(),
  updateSets: [] as Array<Record<string, unknown>>,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: vi.fn(() => state.event) };
    checkout = { sessions: { expire: vi.fn() } };
    subscriptions = { cancel: state.cancel };
    invoices = { retrieve: state.retrieveInvoice };
    refunds = { create: state.refund };
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
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
  hasStripeDeletionTombstone: vi.fn().mockResolvedValue(false),
  getAccountDeletionRequest: vi.fn().mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    stripeSubjects: [],
    attempts: 1,
  }),
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

import {
  hasAccountDeletionTombstone,
  recordLateStripeDeletionSubjects,
} from "@/lib/db/account-deletions";
import { POST } from "./route";

describe("Stripe webhook account-deletion fulfillment barrier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updateSets.length = 0;
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fixture";
    state.event = checkoutEvent();
    state.cancel.mockResolvedValue({ id: "sub_test" });
    state.retrieveInvoice.mockResolvedValue({ payments: { data: [] } });
    state.refund.mockResolvedValue({ id: "re_test" });
    state.grantCredits.mockResolvedValue({ grant: { id: "grant_test" } });
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
    expect(recordLateStripeDeletionSubjects).toHaveBeenCalledOnce();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("rechecks immediately before fulfillment and redacts a newly tombstoned event", async () => {
    vi.mocked(hasAccountDeletionTombstone)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.refund).toHaveBeenCalledOnce();
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
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
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
    expect(state.grantCredits).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({ status: "processed", payload: "{}" })
    );
  });

  it("keeps a paid deleted invoice failed when no refundable payment is available", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);
    state.event = invoiceEvent({ payments: { data: [] } });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(state.refund).not.toHaveBeenCalled();
    expect(state.updateSets).toContainEqual(
      expect.objectContaining({
        status: "failed",
        payload: "{}",
        lastError: "deleted_invoice_manual_reconciliation_required",
      })
    );
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

function subscriptionEvent() {
  return {
    id: "evt_test_deleted_subscription",
    type: "customer.subscription.created",
    created: 1_788_000_001,
    data: {
      object: {
        id: "sub_test_deleted",
        object: "subscription",
        customer: "cus_test_deleted_subscription",
        metadata: {
          userId: "11111111-1111-4111-8111-111111111111",
        },
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

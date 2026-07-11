import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  selectResponses: [] as Array<Array<Record<string, unknown>>>,
  deleted: false,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent(body: string) {
        return JSON.parse(body);
      },
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
        onConflictDoNothing: () => ({
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
        }),
        onConflictDoUpdate: async () => undefined,
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          Object.assign(state.logs[0] ?? {}, value);
        },
      }),
    }),
  },
}));

vi.mock("@/lib/billing/credits", () => ({
  createCreditLedgerService: vi.fn(() => ({
    grantCredits: vi.fn(async () => ({ grant: { id: "grant_route" } })),
  })),
}));

vi.mock("@/lib/billing/credit-ledger-store", () => ({
  createDrizzleCreditLedgerStore: vi.fn(() => ({})),
}));

vi.mock("@/lib/db/account-deletions", () => ({
  hasStripeDeletionTombstone: vi.fn(async () => state.deleted),
}));

import { POST } from "./route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    state.logs.length = 0;
    state.selectResponses.length = 0;
    state.deleted = false;
    process.env.STRIPE_SECRET_KEY = "sk_test_route";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route";
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
    state.deleted = true;
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
    });
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
      lastError: "billing_payment_truth_mismatch:userId",
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

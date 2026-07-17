import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import {
  loadCompleteStripeInvoiceLines,
  selectPaidSubscriptionServicePeriod,
} from "./stripe-invoice-service-period";

const START = 1_783_932_163;
const END = 1_786_610_563;
const SUPPORTED_PRICES = ["price_starter", "price_pro"];

test("uses the modern non-proration subscription line period when the invoice period has zero length", () => {
  const result = selectPaidSubscriptionServicePeriod(
    invoice({
      periodStart: START,
      periodEnd: START,
      lines: [
        modernSubscriptionLine({
          priceId: "price_starter",
          periodStart: START,
          periodEnd: END,
        }),
      ],
    }),
    SUPPORTED_PRICES
  );

  assert.deepEqual(result, {
    priceId: "price_starter",
    periodStart: new Date(START * 1000),
    periodEnd: new Date(END * 1000),
  });
});

test("preserves the earlier single-price invoice-level period fallback", () => {
  const result = selectPaidSubscriptionServicePeriod(
    invoice({
      periodStart: START,
      periodEnd: END,
      lines: [{ pricing: price("price_starter") }],
    }),
    SUPPORTED_PRICES
  );

  assert.deepEqual(result, {
    priceId: "price_starter",
    periodStart: new Date(START * 1000),
    periodEnd: new Date(END * 1000),
  });
});

test("supports a true pre-Basil invoice and line shape", () => {
  const legacyInvoice = invoice({
    periodStart: START,
    periodEnd: END,
    lines: [
      {
        id: "il_legacy",
        price: { id: "price_starter" },
        proration: false,
        period: { start: START, end: END },
        subscription: "sub_legacy",
      },
    ],
  }) as Stripe.Invoice & { subscription: string };
  legacyInvoice.parent = null;
  legacyInvoice.subscription = "sub_legacy";

  assert.deepEqual(
    selectPaidSubscriptionServicePeriod(legacyInvoice, SUPPORTED_PRICES),
    {
      priceId: "price_starter",
      periodStart: new Date(START * 1000),
      periodEnd: new Date(END * 1000),
    }
  );
});

test("legacy compatibility does not weaken modern identity or price ambiguity checks", () => {
  const conflictingSubscription = invoice({
    lines: [modernSubscriptionLine()],
  }) as Stripe.Invoice & { subscription: string };
  conflictingSubscription.subscription = "sub_other";

  const conflictingPrice = invoice({
    lines: [
      modernSubscriptionLine(),
      {
        ...modernSubscriptionLine(),
        price: { id: "price_pro" },
      },
    ],
  });

  const conflictingProration = invoice({
    lines: [
      {
        ...modernSubscriptionLine({ proration: false }),
        proration: true,
      },
    ],
  });

  const missingSubscription = invoice({
    lines: [{ pricing: price("price_starter") }],
  });
  missingSubscription.parent = null;

  const crossSubscriptionLine = invoice({
    lines: [
      modernSubscriptionLine(),
      modernSubscriptionLine({ subscriptionId: "sub_other" }),
    ],
  });

  const oneOffInvoiceItem = invoice({
    lines: [
      {
        ...modernSubscriptionLine(),
        parent: {
          type: "invoice_item_details",
          invoice_item_details: {
            invoice_item: "ii_one_off",
            proration: false,
            subscription: "sub_current",
          },
        },
      },
    ],
  });

  for (const candidate of [
    conflictingSubscription,
    conflictingPrice,
    conflictingProration,
    missingSubscription,
    crossSubscriptionLine,
    oneOffInvoiceItem,
  ]) {
    assert.equal(
      selectPaidSubscriptionServicePeriod(candidate, SUPPORTED_PRICES),
      null
    );
  }
});

test("retrieves every invoice line page before selecting an entitlement line", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const firstPageLine = line({
    id: "il_proration",
    priceId: "price_starter",
    proration: true,
  });
  const renewalLine = line({ id: "il_renewal", priceId: "price_starter" });
  const stripe = stripeWithLinePages(async (params) => {
    calls.push(params);
    return params.starting_after
      ? page([renewalLine], false)
      : page([firstPageLine], true);
  });
  const paginatedInvoice = invoice({
    lines: [firstPageLine],
  });
  paginatedInvoice.id = "in_paginated";
  paginatedInvoice.lines.has_more = true;

  const lines = await loadCompleteStripeInvoiceLines(stripe, paginatedInvoice);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { limit: 100 });
  assert.deepEqual(calls[1], {
    limit: 100,
    starting_after: "il_proration",
  });
  assert.deepEqual(
    selectPaidSubscriptionServicePeriod(
      paginatedInvoice,
      SUPPORTED_PRICES,
      lines
    ),
    {
      priceId: "price_starter",
      periodStart: new Date(START * 1000),
      periodEnd: new Date(END * 1000),
    }
  );
});

test("bounded line retrieval fails closed on empty, duplicate, and over-cap pages", async () => {
  const paginatedInvoice = invoice({ lines: [line({ id: "il_embedded" })] });
  paginatedInvoice.id = "in_incomplete";
  paginatedInvoice.lines.has_more = true;

  await assert.rejects(
    () =>
      loadCompleteStripeInvoiceLines(
        stripeWithLinePages(async () => page([], true)),
        paginatedInvoice
      ),
    hasIncompleteLineEvidenceError
  );
  await assert.rejects(
    () =>
      loadCompleteStripeInvoiceLines(
        stripeWithLinePages(async () =>
          page([line({ id: "il_duplicate" })], true)
        ),
        paginatedInvoice
      ),
    hasIncompleteLineEvidenceError
  );

  let pageNumber = 0;
  await assert.rejects(
    () =>
      loadCompleteStripeInvoiceLines(
        stripeWithLinePages(async () => {
          pageNumber += 1;
          return page([line({ id: `il_${pageNumber}` })], true);
        }),
        paginatedInvoice
      ),
    hasIncompleteLineEvidenceError
  );
  assert.equal(pageNumber, 10);
});

test("fails closed for proration, another subscription, ambiguity, and invalid service periods", () => {
  const invalidInvoices = [
    invoice({
      lines: [modernSubscriptionLine({ proration: true })],
    }),
    invoice({
      lines: [modernSubscriptionLine({ subscriptionId: "sub_other" })],
    }),
    invoice({
      lines: [
        modernSubscriptionLine(),
        modernSubscriptionLine({
          proration: true,
          subscriptionId: "sub_other",
        }),
      ],
    }),
    invoice({
      lines: [
        modernSubscriptionLine({ priceId: "price_starter" }),
        modernSubscriptionLine({ priceId: "price_pro" }),
      ],
    }),
    invoice({
      lines: [modernSubscriptionLine({ periodEnd: START })],
    }),
  ];

  for (const candidate of invalidInvoices) {
    assert.equal(
      selectPaidSubscriptionServicePeriod(candidate, SUPPORTED_PRICES),
      null
    );
  }
});

function invoice({
  lines,
  periodEnd = END,
  periodStart = START,
}: {
  lines: Array<Record<string, unknown> | Stripe.InvoiceLineItem>;
  periodEnd?: number;
  periodStart?: number;
}): Stripe.Invoice {
  return {
    id: "in_test",
    lines: { data: lines, has_more: false },
    parent: {
      subscription_details: { subscription: "sub_current" },
      type: "subscription_details",
    },
    period_end: periodEnd,
    period_start: periodStart,
  } as unknown as Stripe.Invoice;
}

function modernSubscriptionLine({
  periodEnd = END,
  periodStart = START,
  priceId = "price_starter",
  proration = false,
  subscriptionId = "sub_current",
}: {
  periodEnd?: number;
  periodStart?: number;
  priceId?: string;
  proration?: boolean;
  subscriptionId?: string;
} = {}) {
  return {
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        proration,
        subscription: subscriptionId,
        subscription_item: "si_current",
      },
    },
    period: { start: periodStart, end: periodEnd },
    pricing: price(priceId),
    subscription: subscriptionId,
  };
}

function price(priceId: string) {
  return { price_details: { price: priceId } };
}

function line({
  id,
  priceId = "price_starter",
  proration = false,
}: {
  id: string;
  priceId?: string;
  proration?: boolean;
}): Stripe.InvoiceLineItem {
  return {
    ...modernSubscriptionLine({ priceId, proration }),
    id,
  } as unknown as Stripe.InvoiceLineItem;
}

function stripeWithLinePages(
  listLineItems: (params: Record<string, unknown>) => Promise<unknown>
) {
  return {
    invoices: {
      listLineItems: async (
        _invoiceId: string,
        params: Record<string, unknown>
      ) => listLineItems(params),
    },
  } as unknown as Stripe;
}

function page(data: Stripe.InvoiceLineItem[], hasMore: boolean) {
  return { data, has_more: hasMore };
}

function hasIncompleteLineEvidenceError(error: unknown) {
  return (
    (error as { code?: string }).code ===
    "stripe_invoice_line_evidence_incomplete"
  );
}

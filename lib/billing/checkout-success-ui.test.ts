import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CheckoutStatusCard } from "@/app/pricing/success/checkout-success-client";

test("only confirmed checkout state says credits were added", () => {
  const pending = renderToStaticMarkup(
    createElement(CheckoutStatusCard, {
      state: { status: "pending", retryable: true },
      checking: false,
      practiceAvailable: false,
      onRetry() {},
    })
  );
  assert.match(pending, /Confirming your purchase/);
  assert.doesNotMatch(
    pending,
    />Your (?:interview )?credits? (?:is|are) available/i
  );

  const error = renderToStaticMarkup(
    createElement(CheckoutStatusCard, {
      state: { status: "error", reason: "not_found", retryable: false },
      checking: false,
      practiceAvailable: false,
      onRetry() {},
    })
  );
  assert.match(error, /couldn’t match this return/i);
  assert.doesNotMatch(
    error,
    />Your (?:interview )?credits? (?:is|are) available/i
  );

  const confirmed = renderToStaticMarkup(
    createElement(CheckoutStatusCard, {
      state: { status: "confirmed", purchase: "interview_pass" },
      checking: false,
      practiceAvailable: false,
      onRetry() {},
    })
  );
  assert.match(confirmed, /Purchase confirmed/);
  assert.match(confirmed, /one interview credit was added/i);
  assert.doesNotMatch(confirmed, /credit is available/i);
  assert.doesNotMatch(confirmed, /Start an Interview/);
  assert.match(confirmed, /Go to Dashboard/);
  assert.match(confirmed, /Billing Settings/);
});

test("confirmed checkout offers practice only while relaunch access is on", () => {
  const confirmed = renderToStaticMarkup(
    createElement(CheckoutStatusCard, {
      state: { status: "confirmed", purchase: "subscription" },
      checking: false,
      practiceAvailable: true,
      onRetry() {},
    })
  );
  assert.match(confirmed, /plan credits were added/i);
  assert.match(confirmed, /Start an Interview/);
  assert.doesNotMatch(confirmed, /Billing Settings/);
});

test("reversal copy acknowledges prior payment truth without claiming credits were never added", () => {
  const reversed = renderToStaticMarkup(
    createElement(CheckoutStatusCard, {
      state: {
        status: "error",
        reason: "payment_reversed",
        retryable: false,
      },
      checking: false,
      practiceAvailable: false,
      onRetry() {},
    })
  );
  assert.match(reversed, /payment was refunded or disputed/i);
  assert.match(reversed, /credit adjustment/i);
  assert.doesNotMatch(reversed, /No credits are shown as added/i);
  assert.doesNotMatch(reversed, /credits were never added/i);
});

# Manual Exceptional Refunds

Exceptional refunds are case-specific support decisions. Meelni cancellation,
account-deletion, webhook, and recovery workflows must never create one
automatically or promise that one will be approved.

## Required decision record

Before a provider action, a human owner must record:

- the support case identifier and authenticated customer/account reference;
- the approved amount, currency, reason, and responsible human owner;
- whether the operation targets Stripe test mode or live mode;
- confirmation that the amount does not duplicate a prior refund, proration, or
  customer-balance credit.

Keep the audit record redacted. Do not copy customer transcripts, interview
recordings, API keys, webhook secrets, card data, database URLs, or raw provider
payloads into support notes, Linear, or repository documentation.

## Execution is paused

A human may approve or reject an exceptional-refund request, but must not
execute an approved refund for an existing account yet. [SAV-231](https://linear.app/saviiii/issue/SAV-231/billing-truth-reconcile-stripe-refunds-and-retire-legacy-usage)
must first ship and verify exact payment-to-credit-ledger reconciliation. This
runbook intentionally does not invent a Dashboard procedure or ledger-adjustment
procedure while that technical control is absent.

Current behavior is narrower:

- `charge.refunded` records refunded status in payment history only; it does not
  adjust, revoke, or restore credits;
- dispute events are not supported;
- no application route, webhook, or background job executes an exceptional
  payment refund.

After SAV-231, this runbook must be revised with verified idempotency, exact
payment/credit allocation, test/live separation, and redacted evidence before
exceptional-refund execution can begin. Do not issue a second refund to repair
uncertain application state.

The support intake channel, SAV-231, and Stripe test-mode rehearsal evidence are
launch gates outside this repository runbook.

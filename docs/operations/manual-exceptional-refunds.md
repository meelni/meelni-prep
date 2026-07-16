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

## Execution remains paused

A human may approve or reject an exceptional-refund request, but must not
execute an approved refund for an existing account yet. The inherited
[SAV-231](https://linear.app/saviiii/issue/SAV-231/billing-truth-reconcile-stripe-refunds-and-retire-legacy-usage)
billing-truth capability reconciles refund, refund-failure, and dispute
lifecycle events with exact payment-funded credit allocations. It does not
create or authorize an exceptional refund, and no cancellation, deletion,
webhook, or recovery workflow may automatically refund, prorate, compensate, or
issue a make-good for one.

Execution remains paused until all of these gates are complete:

- a human-owned support procedure defines accountable approval, provider action,
  redacted evidence, and recovery for an uncertain result;
- an isolated Stripe test-mode rehearsal proves the approved amount and provider
  object reconcile to the exact payment-funded credit allocation;
- approval evidence records successful idempotent replay and confirms that no
  prior refund, proration, or customer-balance credit is duplicated;
- live-mode execution receives separate, explicit authorization after the
  test-mode evidence is reviewed.

Do not issue a second refund to repair uncertain application state. Every
exceptional refund remains a separate manual decision; cancellation and account
deletion continue to create none automatically.

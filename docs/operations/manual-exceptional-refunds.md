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

## Provider operation

1. Confirm the Stripe Dashboard is in the explicitly approved mode. Test and
   live operations are separate decisions and must never share credentials or
   evidence.
2. Locate the exact PaymentIntent/charge or invoice payment from the approved
   case. Do not infer a refund from subscription cancellation or account
   deletion alone.
3. Have the named human owner create the exact approved refund manually in
   Stripe. Do not add an application endpoint, background retry, or reusable
   automatic refund path for this procedure.
4. Record only the case ID, redacted provider reference/fingerprint, amount,
   currency, mode, human owner, timestamp, and resulting provider status.

## Reconciliation evidence

- Confirm the signed Stripe refund event was processed idempotently.
- For an existing account, confirm payment history and any required
  credit-ledger adjustment match the approved refund exactly and do not revoke
  unrelated trial, pass, admin, refund, or migration credits.
- For a deleted account, preserve financial/legal processor retention and the
  redacted support audit record; do not recreate product identity or transcript
  data to perform reconciliation.
- If webhook or ledger evidence is incomplete, stop and escalate to the human
  owner. Do not issue a second refund to repair application state.

The support intake channel and Stripe test-mode rehearsal evidence are launch
gates outside this repository runbook.

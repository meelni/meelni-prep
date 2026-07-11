# Credit Billing Launch Runbook

Updated: 2026-07-10

This runbook must be completed before enabling the credit-based billing catalog in production.

## Ledger Transaction And Integrity Gate

Every credit mutation must run through the transaction-bound ledger service.
The PostgreSQL store locks the owning `app_user` row before reading or writing
grants, reservations, allocations, or audit transactions. This makes one user
the serialization boundary and keeps balances and audit evidence in the same
commit. Analytics are emitted only after that commit succeeds.

Do not write directly to the ledger tables from a webhook, route, repair script,
or backfill. Subscription renewal must roll eligible credits and issue the new
cycle grant in one ledger transaction. A replay is valid only when its user,
catalog, source, amount, expiration, source/session, and persisted result all
match. Ambiguous or partial evidence must fail with
`credit_ledger_reconciliation_required`; do not automatically repair it.

The database migration test suite exercises concurrent grants, reservations,
settlements, refunds, and rollovers against real PostgreSQL on both a clean
database and the legacy-upgrade path:

```bash
MIGRATION_TEST_DATABASE_URL=postgresql://... npm run test:database-migrations
```

`npm run db:preflight` reports aggregate-only ledger integrity counts under
`creditLedgerIntegrity` and payment-reversal correlation counts under
`billingAdjustmentIntegrity`. Before relaunch, all counts must be zero on the
isolated Preview database. The report must not contain user IDs, Stripe IDs,
balances, or other customer data. Preview currently shares Production data, so
do not run the rehearsal until SAV-226 establishes an isolated environment.

Migration `0013` adds `creditRecoveryIntegrity` and
`creditRecoveryLaunchReady`. Strict launch preflight fails when a version-1
terminal session lacks policy evidence or when release/refund/retain disagrees
with its reservation state. The five-minute `interview-credit-recovery` worker
examines at most 250 rows in stable order and rechecks every candidate under the
canonical locks before repairing it.

Expired nonterminal active reservations release, while expired nonterminal
consumed reservations refund; this also closes the fallback path when a fatal
runtime report could not settle before the runtime exited.

Migration `0015` adds a nullable, unique logical transition key to the Stripe
event log. Exact Event ID retries are acknowledged without replay. Distinct
Stripe Event objects for the same immutable object/type transition replay the
idempotent handler and must match persisted payment truth before they are
acknowledged. Mutable `customer.subscription.updated` events are intentionally
excluded from logical deduplication.

Migration `0016` makes `(stripe_invoice_id, status)` unique for non-null
invoice IDs. This keeps distinct Stripe Event objects for one failed or
successful invoice transition from creating duplicate payment-history rows.
Before the index is created, legacy duplicates are deterministically ranked by
`created_at, id`; non-canonical rows are quarantined without exposing invoice
IDs in preflight output. A successful attempt supersedes failed attempts for
customer payment-history display. Subscription status and grace converge by
provider event time, so success wins a same-second conflict and later delivery
cannot reintroduce stale dunning state. Cursor ordering is scoped to one Stripe
subscription resource: an allowed `customer.subscription.created` replacement
seeds the replacement cursor atomically, and later events from the superseded
resource cannot mutate it.

Migration `0017` makes cross-resource replacement durable rather than relying
on delivery order. Each row stores the Stripe resource creation time and its
created-event cursor, plus every retired subscription identity. A replacement
must be a `customer.subscription.created` event for a provably newer resource;
same-second resources use the stored created-event cursor as the deterministic
tie-breaker. Rows without durable creation proof fail closed on replacement
until provider reconciliation supplies that proof. Retired identities can
never be resurrected by a delayed created event. If replacements race, the
first compare-and-swap winner is provisional: a losing event retry compares
against that active winner and a provably newer generation supersedes it. The
result therefore converges to maximal durable creation proof, independent of
which write won first.

Account-deletion tombstones include hashed customer, subscription,
payment-intent, and charge identifiers. Stored and late refund/dispute payloads
for a deleted subject must be replaced with `{}` and acknowledged without
running billing reconciliation. Migration `0016` stores every event subject
fingerprint and uses transaction-scoped advisory locks plus database triggers
to serialize tombstone and webhook writes; raw payload persistence therefore
cannot race tombstone creation. Every identifier present on a webhook is
checked, while payment-intent and charge subjects remain correlation-only and
are never passed to customer deletion. Customer mappings take precedence over
webhook metadata and disagreement fails closed. Stripe webhook bodies are
limited to 64 KiB before signature verification. Settlement analytics use a
stable one-way user pseudonym and aggregate quantities only; provider
adjustment IDs, grant IDs, and raw user UUIDs are prohibited.

## Migration And Backfill Plan

Do not run production data changes until the preview checks below pass and an owner has reviewed current paid-user state.

1. Snapshot existing billing state:

```sql
SELECT tier, status, COUNT(*)
FROM subscription
GROUP BY tier, status
ORDER BY tier, status;

SELECT COUNT(*) AS usage_records FROM usage_record;
SELECT COUNT(*) AS credit_grants FROM credit_grant;
```

2. Classify users:

| Existing state                         | Launch treatment                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No subscription or `free`              | No automatic full-interview credits unless separately eligible for the one-time 2-credit trial. |
| Active `starter`                       | Grant current-cycle Starter credits only after confirming Stripe price maps to `starter`.       |
| Active `pro`                           | Grant current-cycle Pro credits only after confirming Stripe price maps to `pro`.               |
| Legacy `premium` or unknown paid price | Pause rollout for those users; manually map, grandfather, or refund before enforcing credits.   |
| `past_due` or `canceled`               | Do not backfill new credits; preserve billing state and rely on purchase/reactivation path.     |

Do not pre-grant the relaunch trial. All authenticated accounts without a
`trial:<user_id>` grant remain eligible, regardless of account age or paid
billing history. The first full-interview start request creates that canonical
2-credit grant with a 7-day expiration and then reserves one credit. Signup,
login, setup-page visits, and `GET /api/billing/credits` remain read-only so
they cannot start the trial clock.

A consumed or expired canonical trial is still considered used. On an
activation retry, the ledger must verify that the existing grant belongs to
the same user and is a `trial` catalog/source grant, then create the missing
`trial:<user_id>:grant` transaction if an earlier partial write omitted it.

3. Dry-run proposed backfill in preview:

```sql
SELECT
  s.user_id,
  s.tier,
  s.status,
  s.stripe_price_id,
  s.current_period_start,
  s.current_period_end
FROM subscription s
WHERE s.status IN ('active', 'trialing')
ORDER BY s.updated_at DESC;
```

4. Backfill only through ledger-safe code or SQL that creates both `credit_grant` and `credit_transaction` with stable idempotency keys:

```text
migration:current-cycle:<user_id>:<catalog_id>:<current_period_start_iso>
```

5. Validate after backfill:

```sql
SELECT catalog_id, source, COUNT(*), SUM(original_credits), SUM(remaining_credits)
FROM credit_grant
GROUP BY catalog_id, source
ORDER BY catalog_id, source;

SELECT idempotency_key, COUNT(*)
FROM credit_grant
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

The duplicate-idempotency query must return zero rows.

## Preview Validation Checklist

Run before production launch:

```bash
npm run test:billing
npm run test:workflows
npm run test:core
npm run test:packages
npm run typecheck
```

Stripe manual checks:

- Interview Pass Checkout creates one `checkout` credit grant.
- Starter Checkout creates subscription state and one 4-credit renewal grant.
- Pro Checkout creates subscription state and one 12-credit renewal grant.
- Replayed `checkout.session.completed` and `invoice.payment_succeeded` events do not duplicate grants.
- `refund.created`, `refund.updated`, and legacy `charge.refunded` converge on one provider-object withdrawal; `refund.failed` or canceled status reinstates eligible value once.
- `charge.dispute.created` and `charge.dispute.funds_withdrawn` converge on one withdrawal; `charge.dispute.funds_reinstated` and `charge.dispute.closed` with `won` or `warning_closed` converge on one reinstatement.
- Reversed event order does not leave a stale freeze, and a second same-direction event ID does not produce an idempotency conflict.
- Multiple partial refunds use cumulative floor rounding and never revoke more than the payment-funded source credits.
- Reinstating one adjustment preserves `partially_refunded` or `disputed` payment status while another withdrawal remains active.
- Reinstating one of multiple withdrawals recomputes the aggregate payment target and does not restore more value than all still-active withdrawals permit.
- A credit consumed while frozen remains unrecoverable after a later session refund; overlapping withdrawal/reinstatement order cannot recreate it.
- `invoice.payment_failed` creates failed payment history and no credit grant.
- Distinct `invoice.payment_failed` Event IDs produce one failed payment row
  and preserve the original grace deadline.
- Failure-then-success and success-then-failure delivery both leave the
  subscription active, clear grace, and show only the settled invoice attempt.
- Customer metadata disagreement with a durable mapping fails closed.
- A deleted payment-intent or charge is redacted and acknowledged even when
  another identifier appears first in the Stripe object.
- `/api/billing/sync` never maps unknown Stripe prices to Pro.

Cancellation launch remains blocked on an explicit product-policy decision:
whether cancellation is immediate or remains active through the paid period.
Do not change provider behavior or customer-facing promises until one policy is
accepted and implemented end to end.

Cancellation requests do not collect or log free-form reasons, feedback, or
raw user identifiers. Add cancellation analytics only after defining a bounded
event contract with pseudonymous or aggregate fields.

Until SAV-237 is decided, the immediate-cancellation response must describe any
billing adjustment as a separately processed outcome. It must not promise that
the customer will receive a prorated card refund.

Credit enforcement checks:

- Historical and newly created accounts without `trial:<user_id>` see
  `trialAvailable: true`; repeated credit reads create no grant.
- The first full-interview start grants 2 trial credits, immediately reserves
  1, and sets expiration to 7 days from that start attempt.
- Concurrent or repeated starts leave one canonical trial grant and one grant
  transaction.
- Consumed or expired trial grants report `trialAvailable: false` and are never
  reissued.
- User with 1 available credit can start any PM round type.
- User with 0 credits receives `no_credits_remaining`.
- LiveKit dispatch failure releases the reserved credit.
- Successful usable delivery consumes exactly 1 credit.
- Provider failure before usable delivery releases exactly once.
- Provider or transcript-integrity failure after usable delivery refunds once.
- User end, time limit, and post-usable abandonment retain the consumed credit.
- Feedback dispatch/generation failure does not refund.
- A refund allocated from an expired source produces one non-expiring make-good
  grant and never revives the expired source grant.

## Support Inspection

Use aggregate counts for routine monitoring. For an individual billing support
case, access the authorized support console or run the minimum scoped query in a
protected session; do not copy customer identifiers into tickets or chat.

```sql
SELECT
  id AS session_id,
  lifecycle_state,
  terminal_reason,
  billing_fault,
  billing_fault_code,
  credit_policy_version,
  credit_settlement_action,
  credit_settlement_reason,
  credit_settled_at,
  credit_make_good_grant_id
FROM interview_session
WHERE id = $1;
```

The policy evidence is immutable. Support may explain the stored action but
must not edit it directly. Escalate any missing or contradictory tuple as a
ledger-integrity incident and run recovery; never issue an ad hoc table update.
Raw runtime exceptions, room tokens, recordings, transcripts, and provider
secrets are not support-visible billing evidence.

For a payment-reversal case, inspect the versioned aggregate state separately
from immutable provider events:

```sql
SELECT
  state.source_credits,
  state.target_credits,
  state.revoked_credits,
  state.unrecoverable_credits,
  state.consumed_credits,
  state.version,
  state.updated_at
FROM billing_payment_state state
WHERE state.payment_history_id = $1;

SELECT
  adjustment.adjustment_type,
  adjustment.direction,
  adjustment.amount_in_cents,
  adjustment.revoked_credits,
  adjustment.unrecoverable_credits,
  adjustment.created_at
FROM billing_adjustment adjustment
WHERE adjustment.payment_history_id = $1
ORDER BY adjustment.created_at, adjustment.id;
```

The state is current reconciliation truth; adjustment rows are historical
event evidence and must never be reassigned or rewritten to represent current
freeze ownership.

For rollover provenance, inspect the source lots and reservation splits rather
than attributing pooled consumption from the destination grant total:

```sql
SELECT
  lot.source_grant_id,
  lot.rollover_grant_id,
  lot.original_credits,
  lot.remaining_credits,
  lot.reserved_credits,
  lot.consumed_credits,
  lot.revoked_credits
FROM credit_rollover_lot lot
WHERE lot.source_grant_id = $1
ORDER BY lot.created_at, lot.id;

SELECT
  lot_allocation.reservation_grant_id,
  lot_allocation.rollover_lot_id,
  lot_allocation.credits,
  lot_allocation.revoked_credits
FROM credit_rollover_lot_allocation lot_allocation
JOIN credit_rollover_lot lot ON lot.id = lot_allocation.rollover_lot_id
WHERE lot.source_grant_id = $1
ORDER BY lot_allocation.created_at, lot_allocation.id;
```

Every rollover grant must have source lots whose original, remaining, and
reserved sums equal the destination grant. Every rollover reservation grant
must have lot allocations whose credit and revoked sums equal the aggregate
allocation. Strict preflight reports any mismatch. Do not manufacture lots for
legacy pooled grants: stop launch, isolate the affected accounts, and resolve
them through an explicit support decision with preserved evidence.

## Analytics Events

PostHog server events emitted by the credit ledger:

| Event                             | Key properties                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `billing_credit_granted`          | `catalog_id`, `credit_source`, `credits`, `balance_after`, `idempotency_key`, `source_id`, `duplicate` |
| `billing_credit_reserved`         | `catalog_id`, `credit_source`, `credits`, `session_id`, `reservation_id`, `balance_after`              |
| `billing_credit_consumed`         | `catalog_id`, `credit_source`, `credits`, `session_id`, `reservation_id`                               |
| `billing_credit_released`         | `catalog_id`, `credit_source`, `credits`, `session_id`, `reservation_id`                               |
| `billing_credit_refunded`         | `catalog_id`, `credit_source`, `credits`, `session_id`, `reservation_id`                               |
| `billing_credit_expired`          | `catalog_id`, `credit_source`, `credits`, `grant_id`                                                   |
| `billing_credit_rollover_created` | `catalog_id`, `credits`, `source_id`, `grant_id`, `duplicate`                                          |
| `billing_no_credits`              | `credits`, `balance_after`, `session_id`, `reason`                                                     |
| `billing_credit_payment_adjusted` | `credits`, `reason`, `reserved_credits`, `consumed_credits`, `unrecoverable_credits`, `duplicate`      |

Minimum launch dashboard questions:

- What percent of users hit `billing_no_credits` within 24 hours of signup?
- Which catalog IDs drive the most consumed credits?
- How many subscription credits roll over versus expire?
- How often do duplicate Stripe events occur?

## Provider Cost Measurement

The first launch does not require a finance dashboard, but every weekly review should collect:

- LiveKit session duration by interview session.
- STT/TTS provider usage, if available in provider dashboard.
- LLM prompt/completion token totals for interview dialogue.
- LLM token totals for post-interview feedback.
- Stripe fees by catalog item.
- Failed-start release count and refund count.

Weekly margin worksheet:

```text
gross_revenue_per_catalog_id
- stripe_fees
- livekit_minutes_cost
- stt_cost
- tts_cost
- dialogue_llm_cost
- feedback_llm_cost
= estimated_contribution_margin
```

## Top-Up Decision Checkpoint

Do not launch top-ups in this workstream. Revisit after at least two weeks of launch data or 100 paid credit-consuming sessions, whichever comes first.

Decision inputs:

- `billing_no_credits` rate among active Starter and Pro users.
- Percentage of subscribers consuming 80%+ of included credits.
- Percentage of subscribers with credits expiring unused.
- Support requests asking for one-off extra interviews.
- Estimated contribution margin for Interview Pass.

Possible outcomes:

- No top-up: current pass/subscription mix is enough.
- Small top-up: sell 3 credits with 90-day expiration.
- Larger top-up: sell 6-10 credits only if variable cost data shows comfortable margin.

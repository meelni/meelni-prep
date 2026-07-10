# Credit Billing Launch Runbook

Updated: 2026-07-10

This runbook must be completed before enabling the credit-based billing catalog in production.

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
- `invoice.payment_failed` creates failed payment history and no credit grant.
- `/api/billing/sync` never maps unknown Stripe prices to Pro.

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
- Successful start consumes exactly 1 credit.

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

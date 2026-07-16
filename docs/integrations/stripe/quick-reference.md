# Stripe Test Mode Quick Reference

Use this when testing the credit-based billing catalog locally.

## Billing Catalog

| Catalog ID       | Stripe mode    |       Price |  Credits | Expiration                 | Rollover                  |
| ---------------- | -------------- | ----------: | -------: | -------------------------- | ------------------------- |
| `interview_pass` | `payment`      | $9 one-time |        1 | 30 days                    | No                        |
| `starter`        | `subscription` |   $19/month |  4/month | Active subscription period | Up to 4 credits, 60 days  |
| `pro`            | `subscription` |   $49/month | 12/month | Active subscription period | Up to 12 credits, 60 days |

Required Stripe price env vars:

```bash
STRIPE_INTERVIEW_PASS_PRICE_ID=price_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
```

Create or reuse test-mode products and prices:

```bash
npm run stripe:setup-catalog -- --dry-run
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup-catalog
```

## Test Cards

Success:

```text
Visa:        4242 4242 4242 4242
Mastercard:  5555 5555 5555 4444
Amex:        3782 822463 10005
```

Failures:

```text
Generic decline:     4000 0000 0000 0002
Insufficient funds:  4000 0000 0000 9995
Lost card:           4000 0000 0000 9987
Stolen card:         4000 0000 0000 9979
Expired card:        4000 0000 0000 0069
Incorrect CVC:       4000 0000 0000 0127
3D Secure required:  4000 0025 0000 3155
```

Default test details: future expiry, any CVC, any ZIP.

## Local Webhooks

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
stripe trigger checkout.session.async_payment_succeeded
stripe trigger checkout.session.async_payment_failed
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

Replay a real event after fixing a failed webhook:

```bash
stripe events resend <evt_id> --webhook-endpoint=<endpoint_id>
```

## Database Checks

Latest subscription:

```sql
SELECT u.email, s.tier, s.status, s.billing_cycle, s.stripe_price_id
FROM subscription s
JOIN app_user u ON s.user_id = u.id
ORDER BY s.created_at DESC
LIMIT 5;
```

Credit grants:

```sql
SELECT
  u.email,
  cg.catalog_id,
  cg.source,
  cg.original_credits,
  cg.remaining_credits,
  cg.expires_at,
  cg.idempotency_key
FROM credit_grant cg
JOIN app_user u ON cg.user_id = u.id
ORDER BY cg.created_at DESC
LIMIT 10;
```

Webhook failures:

```sql
SELECT stripe_event_id, event_type, status, attempts, last_error
FROM stripe_event_log
WHERE status = 'failed'
ORDER BY created_at DESC;
```

## Expected Grants

- A paid `checkout.session.completed` for `interview_pass` creates one `credit_grant` with source `checkout` after the server retrieves and validates the authoritative Checkout Session and complete line items.
- An unpaid `checkout.session.completed` creates no grant. A later `checkout.session.async_payment_succeeded` runs the same session-derived grant key; `checkout.session.async_payment_failed` creates no grant and revokes no unrelated credit.
- Immediate completion, delayed success, duplicate delivery, and reordered delivery converge on one grant for the Checkout Session.
- `invoice.payment_succeeded` for `starter` rolls over eligible remaining credits, then grants 4 new credits with source `subscription_renewal`.
- `invoice.payment_succeeded` for `pro` rolls over eligible remaining credits, then grants 12 new credits with source `subscription_renewal`.
- Duplicate Stripe events should not duplicate grants because both `stripe_event_log` and credit ledger idempotency keys are enforced.

## Useful URLs

- Pricing: http://localhost:3000/pricing
- Success: http://localhost:3000/pricing/success
- Canceled: http://localhost:3000/pricing/canceled
- Stripe test dashboard: https://dashboard.stripe.com/test/dashboard

# Stripe Live Mode Checklist

Updated: 2026-06-29
Status: Credit billing setup required

Use this checklist when moving Meelni's credit-based billing catalog from test mode to live mode. Do not commit real Stripe API keys, webhook signing secrets, or live price IDs to this repository.

## Required Stripe Catalog

Create or confirm these live-mode products and prices in the Stripe Dashboard.

| Catalog ID       | Product               |       Price | Mode                    | App env var                       |
| ---------------- | --------------------- | ----------: | ----------------------- | --------------------------------- |
| `interview_pass` | Meelni Interview Pass | $9 one-time | Checkout `payment`      | `STRIPE_INTERVIEW_PASS_PRICE_ID`  |
| `starter`        | Meelni Starter        |   $19/month | Checkout `subscription` | `STRIPE_STARTER_MONTHLY_PRICE_ID` |
| `pro`            | Meelni Pro            |   $49/month | Checkout `subscription` | `STRIPE_PRO_MONTHLY_PRICE_ID`     |

Recommended Stripe metadata:

```text
catalog_id=<catalog_id>
app=meelni
environment=live
```

Trial access is local product state: 2 credits for 7 days. Do not configure a separate Stripe subscription trial for Starter or Pro unless product strategy changes.

You can create or reuse the catalog with:

```bash
npm run stripe:setup-catalog -- --dry-run
STRIPE_SECRET_KEY=rk_live_... npm run stripe:setup-catalog -- --confirm-live
```

For local or preview test mode, omit `--confirm-live` and use an `sk_test_...` key.

Prefer a least-privilege `rk_live_` key for the deployed application. Review
the integration's Stripe Workbench request log, grant only the API permissions
those calls require, and validate the equivalent restricted key in test mode
before cutover. Use a separate temporary restricted key for catalog
administration if it needs broader Product or Price write access, then revoke
it after setup.

## Environment Variables

Configure these in Vercel for Production:

```bash
STRIPE_SECRET_KEY=rk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_INTERVIEW_PASS_PRICE_ID=price_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=https://meelni.com
```

Configure test-mode equivalents in local and preview environments.

## Webhook Endpoint

Production endpoint:

```text
https://meelni.com/api/webhooks/stripe
```

Subscribe the endpoint to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `charge.refunded`

Optional future event:

- `customer.subscription.trial_will_end`

After creating the endpoint, copy its signing secret into `STRIPE_WEBHOOK_SECRET` in the matching Vercel environment.

## Customer Portal

Configure the Stripe Customer Portal so users can:

- Update payment methods.
- Cancel Starter and Pro subscriptions.
- Switch between Starter and Pro if you want self-serve plan changes at launch.
- View invoices and receipts.

Do not expose Interview Pass as a subscription option in the portal; it is a one-time Checkout purchase.

## Pre-Launch Verification

Run local checks:

```bash
npm run test:billing
npm run test:workflows
npm run test:core
npm run test:packages
npm run typecheck
```

Complete the operational runbook:

```text
docs/operations/credit-billing-launch.md
docs/integrations/stripe/test-plan.md
```

Manual Stripe checks:

- Interview Pass Checkout grants exactly one credit.
- Starter Checkout creates an active subscription and grants 4 credits.
- Pro Checkout creates an active subscription and grants 12 credits.
- Replayed `checkout.session.completed` and `invoice.payment_succeeded` events do not duplicate credits.
- Failed invoice payment marks the subscription `past_due` and does not grant credits.
- Customer Portal opens for paid subscribers.
- Unknown price IDs do not silently map to Pro.

## Production Cutover

Before enabling credit enforcement in production:

- Snapshot existing `subscription`, `credit_grant`, and `usage_record` state.
- Classify any legacy `free`, `premium`, old `$29 Pro`, or unknown paid users.
- Decide whether each legacy paid user should be grandfathered, migrated, refunded, or asked to repurchase.
- Verify live price IDs point to the new credit catalog, not the old unlimited Pro product.
- Confirm webhook delivery returns 2xx responses in the Stripe Dashboard.

## Secret Hygiene

If a real API key or webhook signing secret is ever committed, rotate it immediately in the Stripe Dashboard and update Vercel. Treat live secret keys and webhook secrets as compromised after commit, even if the repository is private.

## Rollback

If production billing fails:

1. Disable or hide purchase entry points in the app.
2. Roll back the Vercel deployment.
3. Pause or disable the Stripe webhook endpoint if it is writing bad state.
4. Reconcile `stripe_event_log`, `subscription`, and `credit_grant` before re-enabling checkout.

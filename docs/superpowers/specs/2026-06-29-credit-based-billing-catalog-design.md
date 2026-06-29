# Credit-Based Billing Catalog Design

Date: 2026-06-29
Status: Accepted strategy, not yet implemented

## Summary

Meelni should replace the ongoing free interview experience and unlimited Pro plan with a credit-based billing catalog. Free remains an acquisition and discovery motion, but authenticated full interviews require trial, subscription, pass, top-up, or admin credits.

The primary product lever is monetization with healthy activation: users should reach the first full interview and feedback artifact quickly, while Meelni keeps voice-session costs bounded.

## Product Catalog

| Offer | Price | Included credits | Rollover | Expiration | Notes |
| --- | ---: | ---: | --- | --- | --- |
| Trial | $0 | 2 | No | 7 days | One trial per user. All round types unlocked during trial while credits remain. |
| Interview Pass | $9 | 1 | Not applicable | 30 days | One-time purchase for low-commitment users with one imminent interview. |
| Starter | $19/month | 4/month | Up to 4 extra | 60 days | Light prep plan, about one interview per week. |
| Pro | $49/month | 12/month | Up to 12 extra | 60 days | Serious prep plan, about two to three interviews per week. |
| Top-up | Post-launch SKU | Post-launch SKU | Not applicable | 90 days | Do not launch in the first billing slice; add after observing subscriber credit exhaustion. |
| Admin grant | $0 | Manual | Configurable | Configurable | Support, QA, founder-led pilots, and make-good credits. |

Monthly subscription credits should be granted at subscription start and renewal. Unused monthly credits roll over for one extra month, capped at one month of the subscriber's plan allowance. Trial credits do not roll over. One-time pass credits expire after 30 days. Top-up credits expire after 90 days.

## Entitlements

Meelni should stop treating interview type as the free/paid boundary. Any non-expired credit-bearing state unlocks all PM round types:

- Product Sense
- Behavioral
- Execution
- Strategy

Access should be computed from capabilities rather than tier strings:

- `canStartInterview`
- `remainingCredits`
- `allowedRoundTypes`
- `creditExpiresAt`
- `billingStatus`
- `activeOffer`
- `canBuyTopUp`
- `trialAvailable`

This avoids spreading product rules across setup UI, API routes, Stripe handlers, modals, structured data, and dashboard billing cards.

## Cost Guardrails

The old $29/month unlimited plan is not acceptable for the current voice-interview cost shape. Meelni's actual cost per session still needs production billing validation, but the working planning range is:

| Session type | Typical duration | Planning variable cost |
| --- | ---: | ---: |
| Behavioral | 30 minutes | about $0.90 to $1.75 |
| Product Sense / Execution / Strategy | 45 minutes | about $1.25 to $2.75 |

These ranges include voice runtime, STT, LLM dialogue, TTS, and feedback generation assumptions. They should be replaced with measured provider costs after the first billing implementation is instrumented.

The catalog protects margin by:

- pricing a single interview above expected per-session variable cost;
- making subscriptions a prepaid credit bundle rather than unlimited use;
- limiting rollover to one extra month;
- allowing top-ups instead of forcing upgrades for temporary spikes;
- keeping trial small enough to activate without inviting heavy free usage.

## User Experience

The public and authenticated pricing surfaces should share one catalog source.

Recommended copy direction:

- Trial: "Try 2 full PM interviews free"
- Interview Pass: "One focused interview, no subscription"
- Starter: "4 interviews per month"
- Pro: "12 interviews per month"
- Rollover: "Unused monthly credits roll over for one extra month"

When a user has no usable credits, setup should show a credit-specific purchase path rather than a generic quota modal. The user should see:

- remaining credits;
- soonest credit expiration;
- renewal date when subscribed;
- options to start trial, buy pass, subscribe, or buy top-up depending on state.

## Billing Architecture

Add a canonical billing catalog and credit ledger. The catalog owns product definitions; the ledger owns spendable interview credits.

Recommended modules:

- `packages/core/src/billing-catalog.ts`
  - Catalog IDs, prices, included credits, rollover caps, expiration rules, and display metadata.
- `packages/core/src/entitlements.ts`
  - Provider-independent entitlement and capability computation.
- `lib/billing/credits.ts`
  - Credit grants, reservations, consumption, release/refund, expiration, and balance queries.
- `lib/billing/stripe-adapter.ts`
  - Stripe Checkout Session creation, Stripe price mapping, webhook normalization, and customer portal routing.
- `lib/workflows/start-session.ts`
  - The single enforcement boundary for starting full interviews.

The route layer should remain thin: authenticate, parse, call workflow, return mapped response.

## Credit Lifecycle

Starting an interview should not simply increment a monthly usage counter. It should reserve and then consume one credit:

1. User starts an interview.
2. Session workflow checks entitlement and available credits.
3. Workflow reserves one credit with an idempotency key tied to the session/start attempt.
4. Workflow creates the interview session and starts LiveKit.
5. If start succeeds, reservation becomes consumed.
6. If LiveKit/session creation fails, reservation is released.
7. If the session is invalid because of system failure, support or automated recovery can refund the consumed credit.
8. If the user abandons after a successful start, the credit remains consumed unless a future product decision changes this.

This supports trial credits, pass credits, subscription credits, top-ups, rollover, and admin grants without custom tier branches.

## Data Model Direction

The current `subscription` and `usage_record` tables are not enough for the accepted catalog. Add or migrate toward:

- `billing_account`
  - One per user. Stores Stripe customer ID and normalized billing status.
- `billing_subscription`
  - Subscription plan, Stripe subscription ID, period dates, cancel-at-period-end, and status.
- `credit_grant`
  - Source, credits granted, credits remaining, grant period, expiration, rollover metadata, Stripe references.
- `credit_transaction`
  - Ledger entries for grant, reserve, consume, release, refund, expire, adjustment.
- `billing_event`
  - Normalized Stripe event processing state and idempotency.

The existing Stripe event log, payment history, and customer mapping can be preserved or migrated if they fit the final schema. The implementation plan should choose the lowest-risk migration path after checking current production data.

## Stripe Integration

Use Stripe Checkout Sessions:

- `mode: "subscription"` for Starter and Pro.
- `mode: "payment"` for Interview Pass and future top-ups.
- Stripe Customer Portal for subscription management.

Webhooks should normalize Stripe events before writing billing state. The important normalized events are:

- checkout completed for one-time pass;
- checkout completed for subscription;
- subscription created/updated/deleted;
- invoice paid;
- invoice payment failed;
- refund or dispute events if credits should be adjusted;
- trial ending notification, if email is added later.

Stripe price IDs should map to catalog IDs, not directly to tier strings in route files.

## Existing Friction To Fix

The current implementation has several mismatches that should be addressed as part of the billing slice:

- Core entitlements still include `free | pro | premium`, while the database currently constrains subscription tiers to `free | pro`.
- Free Product Sense access and three free monthly interviews are hardcoded in multiple places.
- Pricing page behavior is feature-gated as discontinued, while in-app modals still advertise Pro at $29/month.
- Structured data still describes a free plan and stale price validity.
- Stripe client API versions are duplicated and pinned in route files.
- Webhook code references premium trial updates that do not match the current schema.
- Some tests are stale relative to the current quota enforcement behavior.
- TypeScript and Python runtime defaults disagree on TTS provider strings in some files.

## Rollout Sequence

1. Create the canonical catalog and entitlement contract.
2. Add credit ledger schema and service.
3. Update session start to reserve and consume credits.
4. Update checkout and webhooks to grant credits.
5. Replace setup, pricing, upgrade modal, quota modal, dashboard billing, and structured-data copy from the catalog.
6. Add migration/backfill for existing free/pro users.
7. Add tests for entitlement computation, credit lifecycle, webhook idempotency, and session-start failure recovery.
8. Add cost and credit analytics events.

## Validation

Required automated coverage:

- Catalog contract tests for product IDs, rollover caps, and expiration.
- Entitlement tests for trial, pass, starter, pro, expired, and admin states.
- Credit ledger tests for reserve, consume, release, refund, expiration, rollover cap, and idempotency.
- Session workflow tests proving no credit is consumed when LiveKit fails.
- Stripe webhook tests proving duplicate events do not double-grant credits.
- UI route/component tests where existing patterns allow it.

Manual checks:

- Trial checkout-free activation path.
- One-time pass checkout.
- Starter and Pro checkout.
- Customer Portal cancel/reactivate.
- No-credit setup state.
- Rollover display after simulated renewal.

## Open Questions

- Whether post-launch top-ups should be sold, and at what price/package size, after subscriber credit exhaustion data is available.
- Whether one credit always equals any full interview length, or whether longer interviews eventually cost more credits.
- Exact production cost per session after measured LiveKit/Inference/LLM billing data is available.
- Migration treatment for existing paid users if any are active when this ships.

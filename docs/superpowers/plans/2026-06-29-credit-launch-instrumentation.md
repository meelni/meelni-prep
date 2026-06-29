# Credit Launch Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-125` so the credit billing launch has migration/backfill guidance, measurable credit lifecycle events, provider cost hooks, validation commands, and a top-up decision checkpoint.

**Architecture:** Add a focused server-side billing analytics helper and call it from the credit ledger service, which is the narrowest shared point for grants, reservations, consumption, release, refund, expiration, and rollover. Keep migration/cost guidance in an operations runbook rather than applying production data changes. Update PostHog event docs to include credit billing events.

**Tech Stack:** TypeScript, PostHog server helper, credit ledger service, Markdown operations docs.

---

## Task 1: Plan Pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-29-credit-launch-instrumentation.md`

- [ ] Commit this plan.

## Task 2: Billing Analytics Helper

**Files:**
- Create: `lib/billing/analytics.ts`
- Modify: `lib/analytics/types.ts`

- [ ] Add typed event names for `billing_credit_granted`, `billing_credit_reserved`, `billing_credit_consumed`, `billing_credit_released`, `billing_credit_refunded`, `billing_credit_expired`, `billing_credit_rollover_created`, and `billing_no_credits`.
- [ ] Add server helper functions that call `trackServerEvent` with catalog ID, credit source/type, credits, idempotency key, source/session ID, and balance fields.
- [ ] Run `npm run typecheck`.
- [ ] Commit `Add billing credit analytics helpers`.

## Task 3: Credit Ledger Instrumentation

**Files:**
- Modify: `lib/billing/credits.ts`

- [ ] Track credit grant creation and idempotent duplicate grant observations.
- [ ] Track no-credit reservation attempts.
- [ ] Track reserve, consume, release, refund, expire, and rollover events.
- [ ] Run `npm run test:billing` and `npm run typecheck`.
- [ ] Commit `Instrument credit ledger events`.

## Task 4: Launch Runbook

**Files:**
- Create: `docs/operations/credit-billing-launch.md`
- Modify: `docs/integrations/posthog/events.md`
- Modify: `docs/integrations/stripe/test-plan.md`

- [ ] Document migration/backfill plan before production data changes.
- [ ] Document preview validation commands and SQL checks.
- [ ] Document provider cost measurement fields and manual data sources.
- [ ] Add top-up decision checkpoint based on no-credit and subscriber exhaustion data.
- [ ] Update PostHog event docs with billing event names/properties.
- [ ] Run `npm run typecheck`.
- [ ] Commit `Document credit billing launch checks`.

## Task 5: Final Handoff

- [ ] Run `npm run test:billing`, `npm run test:workflows`, `npm run test:core`, `npm run test:packages`, and `npm run typecheck`.
- [ ] Push branch `codex/sav-125-credit-migration-analytics`.
- [ ] Open a draft PR against `codex/sav-124-credit-product-surfaces`.
- [ ] Move `SAV-125` to In Review and attach PR/validation notes.

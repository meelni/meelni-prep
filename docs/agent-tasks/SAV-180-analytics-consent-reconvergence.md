# SAV-180: Explicit Analytics Consent Reconvergence

## Intent

- User request: Continue the accepted relaunch-readiness program and resolve the highest-priority provider-free blocker.
- Product/user outcome: Fresh and declined visitors create no optional PostHog or Statsig analytics, autocapture, or replay traffic.
- Why now: The current main branch still uses soft opt-in behavior and the parked implementation never merged.

## Slice

- Primary slice: Privacy consent and optional analytics provider lifecycle.
- Secondary slices: Auth identity transitions, server billing analytics, migration rollout, settings UI, and privacy documentation.
- Relevant skills: `meelni-linear-workstream`, `meelni-ui-design-system`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-164.
- Child deliverable issue: SAV-180.
- Current Linear state: In Progress.

## Scope

- In scope: Tri-state persistence, same-origin API, host-only cookie isolation, browser/server provider gating, immediate withdrawal, subject changes, minimized provider identity and payloads, migration 0023, tests, docs, and rollout evidence.
- Out of scope: Relaunch activation, Production/provider mutation, legal approval, provider retention policy, or enabling replay/autocapture.
- Assumptions: Parked PR #253 is reference material only; current `main` is the implementation base.

## Technical Plan

- Workflow owner: Versioned analytics consent contract and trusted server resolver.
- Provider dependencies: PostHog and Statsig; tests use fakes and require no live provider.
- Data change: Additive `user_settings` consent columns after migration 0022.
- Rollback: Keep the relaunch flag off, preserve additive columns, and fail closed if the consent API or database is unavailable.

## Validation

- Required: Typecheck, test typecheck, analytics/provider/API/billing tests, migration checks, lint, build, and agent verification.
- Manual follow-up: Isolated Preview browser-network matrix after SAV-226 provider isolation.

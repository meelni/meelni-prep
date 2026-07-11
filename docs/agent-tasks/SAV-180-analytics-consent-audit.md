# SAV-180: Analytics Consent Audit

## Intent

- User request: Independently audit explicit analytics consent on its stacked PR #249 base and remediate verified gaps.
- Product/user outcome: Fresh and declined visitors generate no optional PostHog, Statsig analytics, or replay traffic; accepted traffic remains minimized and revocable.
- Why now: The relaunch remains default-off and the consent slice must be trustworthy before the public demo stack can advance.

## Slice

- Primary slice: Cross-layer analytics consent and provider lifecycle.
- Secondary slices: Feature-flag fallback, billing analytics, auth transitions, migration rollout, and privacy content.
- Relevant skills: `meelni-vertical-slice-playbooks`, `meelni-linear-workstream`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Child deliverable issue: SAV-180.
- Current Linear state: Unknown; connector requires OAuth and no write is claimed.

## Scope

- In scope: Consent resolution and persistence, client/server provider gating, withdrawal and subject races, event payload minimization, migration compatibility, and targeted tests.
- Out of scope: Retargeting PR #253 to `main`, merging either stacked PR, enabling the relaunch fallback, legal approval, or enabling replay/autocapture.
- Assumptions: PR #253 remains stacked on PR #249 and must converge on the current PR #249 head before review.

## Technical Plan

- Workflow owner: The versioned analytics consent contract and trusted server resolver.
- Provider dependencies: PostHog and Statsig.
- Data changes: Additive user-settings consent columns in migration 0009.
- Rollback: Keep the relaunch fallback false and preserve additive columns; an older app must not restore soft opt-in behavior.

## Validation

- Required: Typecheck, test typecheck, lint, workflows, API, billing, privacy guardrails, full CI, production build, and disposable PostgreSQL migration verification.
- Provider boundary checks: No client construction before acceptance, no replay/autocapture, event allowlists, pseudonymous account identity, consent-aware server delivery, and evaluation-only Statsig proxying.

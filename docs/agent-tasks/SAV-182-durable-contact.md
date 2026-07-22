# SAV-182 Durable Contact Intake

## Intent

- User request: make the public support form durable, abuse-resistant, and honest before relaunch.
- Product/user outcome: a visitor sees success only after their request is committed to the support inbox and gets a stable receipt for safe retries; a relaunch candidate cannot pass shared-environment checks without the abuse-control secret.
- Why now: the previous route returned success when neither email delivery nor persistence had succeeded.

## Slice

- Primary slice: public contact submission, persistence, and recovery.
- Secondary slices: database migration, operator triage, privacy-safe operations, and public UI states.
- Relevant skills: Linear workstream, vertical-slice playbook, architecture, UI design system, ops connections, engineering memory, and PR prep.

## Linear Tracking

- Project: Meelni Relaunch.
- Parent slice issue: SAV-182.
- Child deliverable issue: none; this is the bounded SAV-182 branch.
- Current Linear state: In Progress.

## Scope

- In scope: typed validation, PostgreSQL persistence, idempotency, distributed rate limiting, HMAC identities, deploy-time secret enforcement, individually attributable audited operator triage, truthful UI states, migration rehearsal, tests, and runbooks.
- Out of scope: Resend/email delivery, production environment mutation, shared database migration, relaunch flag changes, contact-content retention policy, and a support-agent UI.
- Assumptions: Vercel remains the trusted production edge; direct email fallbacks remain visible until this path is deployed and operated successfully; Supabase/PostgREST shared roles are never a contact-PII triage path.

## Product Lens

- Audience: candidates and customers who need account, billing, bug, or product support.
- Lever: trust and recovery during activation and paid-product use.
- Product Compass note: the form is a support request, not a marketing conversion or an interview-practice workflow.

## Technical Plan

- App files: `app/contact/page.tsx`, `app/api/contact/route.ts`.
- Workflow files: contact contracts, submission workflow, PostgreSQL adapter, HMAC identity helper.
- Data/provider dependencies: PostgreSQL and Vercel environment declaration only; no email-provider dependency and no Supabase Data API triage dependency.
- Docs: contact contract, contact operations runbook, database migration current state.

## Validation

- Required: workflow/security/API tests, typecheck, lint, build, local PostgreSQL clean/upgrade migration rehearsal, schema fingerprint, quality/secret scan.
- Manual: responsive contact UI, keyboard path, failure/retry, saved receipt, direct email fallback.
- Regression fixtures: idempotent concurrent writes, changed-payload conflict, malformed-request attempt accounting, shared rate-limit exhaustion, barrier-controlled contact/deletion races in both commit orders, missing-user rejection, service-role triage denial, two distinct named-login audit identities, exact triage-group privileges, bounded stale-limit cleanup, and shared-environment secret absence/weakness.

## Rollout

- Risk level: high because the route accepts customer PII and makes a durability claim.
- Backward compatibility: direct email addresses remain; migration is additive; runtime limiter/cleanup access remains separate from PII triage; no provider delivery is claimed.
- Watch: 202/200/409/429/503 counts, database latency/errors, limiter row growth, cleanup count, queue age, and unclaimed requests. Metrics must contain no contact content.
- Follow-up: Product/Legal must accept a contact-content retention/deletion policy; Operations must configure the HMAC secret, provision approved named PostgreSQL operator logins, and prove the triage/cleanup schedule before enabling the path for launch.

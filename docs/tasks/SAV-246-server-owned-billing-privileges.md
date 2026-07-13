# SAV-246 Server-Owned Billing Privileges

## Intent

- User request: Complete every accepted relaunch-readiness issue and make the safest implementation decisions autonomously.
- Product/user outcome: Browser-facing Supabase roles cannot access server-owned payment, adjustment, or rollover provenance tables in any environment.
- Why now: Dedicated Preview bootstrap exposed broader provider default grants on four billing tables that the local migration fixture did not model.

## Slice

- Primary slice: billing, trials, and entitlements
- Secondary slices: database migration contract and provider-isolation tooling
- Relevant skills: meelni-linear-workstream, meelni-vertical-slice-playbooks, meelni-engineering-memory, meelni-codebase-architecture

## Linear Tracking

- Project: Meelni
- Parent slice issue: SAV-226
- Child deliverable issue: SAV-246
- Current Linear state: In Progress

## Scope

- In scope: One forward migration that revokes client/public privileges and explicitly preserves service-role privileges for the four server-owned billing tables; realistic Supabase default-privilege fixture; schema fingerprints, privilege assertions, migration preflight, and runbook evidence.
- Out of scope: Global provider default-privilege changes, repository-wide service-role least-privilege redesign, application billing behavior, Production migration, or customer data.
- Assumptions: RLS currently denies anonymous/authenticated access, but ACL drift is still a launch-blocking contract gap; the repair remains in the migration ledger after application rollback.

## Product Lens

- Audience: Every Meelni candidate whose billing and credit provenance must remain server-private.
- Activation/retention/monetization/growth lever: Monetization trust and launch-risk containment.
- Product Compass note: Billing implementation details remain invisible to customer-facing clients and language.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `lib/db/migrations/0022_server_owned_billing_privileges.sql`, Drizzle journal/snapshot, database migration contract tests and preflight fixtures.
- Data or provider dependencies: Dedicated Preview Supabase only after local migration validation; no Production target.
- Docs/decisions to update: Migration operations notes and this task intake; no new product decision record.

## Validation

- Required commands: clean migration chain, schema fingerprint, exact ACL assertions, anon/authenticated behavioral denial, service-role access, migration preflight, Drizzle consistency, typechecks/build as proportional.
- Optional/manual checks: Apply 0022 to dedicated Preview and compare grants without exposing credentials.
- Fixtures or regression tests needed: Supabase-equivalent default table grants before migrations and exact four-table post-migration privilege matrix.

## Rollout

- Risk level: Medium; permission-only forward migration on server-owned tables.
- Backward compatibility: Server/database workflows retain explicit service-role access; client roles lose access they should never use.
- Metrics/events to watch: Migration status, schema fingerprint, client denial checks, server billing webhook success.
- Follow-up slice: Remaining LiveKit/Inngest Preview isolation and the feature-flag-off golden path.

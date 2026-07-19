# SAV-204 Question Provenance And Duplicate Quality

## Intent

- User request: Remove duplicate or untraceable public question records before relaunch.
- Product/user outcome: Candidates see one source-backed practice choice per deterministic question group; unverified legacy rows stay hidden while matching IDs can be adopted in place.
- Why now: Wave 1 acquisition-to-practice trust depends on a reviewable corpus.

## Slice

- Primary slice: Question bank and SEO.
- Secondary slices: Sync operations, database contract, public Explore verification.
- Relevant skills: Question-bank SEO, vertical slice, UI design system, architecture, engineering memory, PR prep, and Linear workstream.

## Linear Tracking

- Project: Meelni.
- Parent slice: SAV-169.
- Child deliverable: SAV-204.
- Current state: In Progress.

## Scope

- In scope: Exact/near-duplicate policy, internal provenance fingerprint/category, fail-closed unverified disposition, canonical linkage, deterministic safe aggregates, compatibility migration, and public projection evidence.
- Out of scope: Fuzzy semantic matching, public provenance claims, taxonomy expansion, question-page redesign, or enabling the relaunch flag.
- Assumptions: Existing `is_active` remains the publication contract and source comments/notes remain private and unstored.

## Technical Plan

- Sync boundary: Normalize provider rows and hash only non-private source fields.
- Workflow: Quarantine unverified legacy rows, adopt source-matched canonical IDs, quarantine conservative near duplicates, and retire source-missing or surplus rows atomically.
- Data: Add source kind/category/fingerprint, quality status, and canonical duplicate linkage.
- Public surfaces: Keep API payloads, active filtering, counts, structured data, and selected-question handoff unchanged.
- Memory: Update the question-bank contract and sync runbook.

## Validation

- Required: Targeted question sync tests, database migration clean/upgrade harness, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when feasible.
- Manual: Provider-backed dry-run aggregate report and Explore desktop/mobile checks with one published row and quarantined duplicates.
- Regression fixtures: Exact fingerprint duplicate, punctuation/provenance near duplicate, active-ID preservation, source removal, transactional failure, migration backfill, public RLS projection, and fingerprint format enforcement.
- Current branch evidence: 67 targeted question/sync/route/session tests pass, including public `activeOnly=false` compatibility behavior and adversarial superscript, circled-number, semantic-dash, relational, percentage, currency, and arithmetic notation. Typecheck, test typecheck, Drizzle metadata validation, and the disposable PostgreSQL 17 clean/legacy-upgrade/idempotence migration harness pass. Full CI/build remain pending.
- Pending environment evidence: Provider-backed corpus dry run and Preview browser inspection remain gated on an isolated approved Preview environment. This worktree has no `.env.local`; no remote provider or shared database was contacted.

## Rollout

- Risk: High because the change is schema-backed and controls public corpus membership.
- Backward compatibility: Public payload shape remains unchanged. `is_active` remains the publication projection, but unverified legacy rows intentionally become inactive until a source-backed sync adopts them in place.
- Migration coordination: `0024_question_provenance` is generated from PR #324 exact head `72aa4d3735046014a11d5f75bc2e0c76d3ce6d87`; regenerate if the stacked parent changes.
- Feature flag: Relaunch remains default-off and is not changed by this slice.

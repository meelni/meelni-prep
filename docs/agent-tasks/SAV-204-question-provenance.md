# SAV-204 Question Provenance And Duplicate Quality

## Intent

- User request: Remove duplicate or untraceable public question records before relaunch.
- Product/user outcome: Candidates see one trustworthy practice choice per deterministic question group while selected-question IDs remain stable.
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

- In scope: Exact/near-duplicate policy, internal provenance fingerprint/category, quality disposition, canonical linkage, deterministic safe aggregates, compatibility migration, and public projection evidence.
- Out of scope: Fuzzy semantic matching, public provenance claims, taxonomy expansion, question-page redesign, or enabling the relaunch flag.
- Assumptions: Existing `is_active` remains the publication contract and source comments/notes remain private and unstored.

## Technical Plan

- Sync boundary: Normalize provider rows and hash only non-private source fields.
- Workflow: Preserve active canonical IDs; quarantine conservative near duplicates; retire source-missing and legacy surplus rows atomically.
- Data: Add source kind/category/fingerprint, quality status, and canonical duplicate linkage.
- Public surfaces: Keep API payloads, active filtering, counts, structured data, and selected-question handoff unchanged.
- Memory: Update the question-bank contract and sync runbook.

## Validation

- Required: Targeted question sync tests, database migration clean/upgrade harness, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when feasible.
- Manual: Provider-backed dry-run aggregate report and Explore desktop/mobile checks with one published row and quarantined duplicates.
- Regression fixtures: Exact fingerprint duplicate, punctuation/provenance near duplicate, active-ID preservation, source removal, transactional failure, migration backfill, public RLS projection, and fingerprint format enforcement.

## Rollout

- Risk: High because the change is schema-backed and controls public corpus membership.
- Backward compatibility: `is_active` and public question payloads remain unchanged; existing IDs are adopted in place.
- Migration coordination: The generated migration sequence is provisional. SAV-241 must regenerate it against the canonical merged predecessor before merge.
- Feature flag: Relaunch remains default-off and is not changed by this slice.

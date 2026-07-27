# Question Bank filter and count fix

## Status

- Complete on `codex/dashboard-follow-up-cleanup`.
- The implementation is intentionally uncommitted so it remains grouped with
  the current dashboard design-quality work.

## Intent

- User request: Fix Question Bank filters and counts that feel inconsistent.
- Product/user outcome: Every selected filter, visible result, and displayed
  count describes the same question set.
- Why now: The current page mixes server-filtered totals with client-filtered
  rows, which creates contradictory states.

## Slice

- Primary slice: Authenticated Question Bank discovery.
- Secondary slices: Responsive filters, result summaries, and browser fixtures.
- Relevant skills: `meelni-ui-design-system`, Product Design audit, and React
  best practices.

## Linear Tracking

- Project: Requested as part of the consolidated principal-design cleanup.
- Parent slice issue: Pending connector availability.
- Child deliverable issue: Pending connector availability.
- Current Linear state: The installed connector is not callable in this
  workspace. See `2026-07-27-principal-dashboard-design-cleanup.md`.

## Scope

- In scope: Load one authoritative published corpus, derive contextual round and
  company facets, add an explicit company reset, make result copy truthful, and
  cover desktop/mobile interactions.
- Out of scope: Question ingestion, publication policy, bookmarks, interview
  launch behavior, and a new pagination design.
- Assumptions: The existing paginated public Questions API remains the source
  of truth.

## Product Lens

- Audience: PM candidates browsing for a relevant practice question.
- Activation/retention lever: Reduce discovery friction before starting a mock
  interview.
- Product Compass note: Counts should help users predict the result of a filter,
  not expose implementation details.

## Technical Plan

- Likely app files: Dashboard Question Bank section.
- Likely package/workflow files: A pure dashboard filter contract and browser
  regression coverage.
- Data or provider dependencies: Existing `/api/questions` pagination only.
- Docs/decisions to update: This task record; no architecture decision required.

## Validation

- Required commands: Typecheck, test typecheck, targeted contracts, lint,
  formatting, and fixture-boundary checks.
- Optional/manual checks: In-app browser at 390px, 768px, and 1280px.
- Fixtures or regression tests needed: Round selection, company facets, search
  totals, clear-filter recovery, and stable all-round counts.

## Result

- The page now loads the full published question corpus before deriving filters,
  so server pagination no longer changes the meaning of a count.
- Round facets omit the selected round while respecting search and company;
  company facets omit the selected company while respecting search and round.
- Desktop and compact filters use the same contextual totals, with explicit
  `All companies` recovery.
- Result copy reports the exact visible set (`18 questions`,
  `5 questions match`, or `1 question matches`) and saved counts are scoped to
  visible results.
- Long company labels wrap without widening the page, and the result pane
  remains the only scrolling region at desktop widths.

## Verification Completed

- `npm run typecheck`
- `npm run typecheck:tests`
- `npx tsx --test lib/dashboard/question-bank-filters.test.ts lib/dashboard/contracts.test.ts`
- `npm run lint`
- `npm run format:check:quality`
- `node scripts/verify-browser-fixture-boundary.mjs`
- `node --test scripts/design-system-guardrails.test.mjs`
- `git diff --check`
- In-app browser: desktop search, round and company selection, company reset,
  result totals, and no horizontal overflow at 1280px.
- In-app browser: native filter selection, result totals, and no horizontal
  overflow at 390px and 768px.
- Audit evidence:
  `.context/audits/question-bank-filter-counts-2026-07-26/`.

## Rollout

- Risk level: Low.
- Backward compatibility: No API contract or persistence changes.
- Metrics/events to watch: Existing Question Bank views and interview starts.
- Follow-up slice: Add paginated rendering only if the published corpus grows
  beyond the current dashboard density.

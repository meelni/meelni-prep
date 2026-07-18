# SAV-213 Representative Browser QA Matrix

## Intent

- User request: Continue the approved Meelni relaunch-readiness program while
  preserving the owner's sole launch GO/NO-GO authority.
- Product/user outcome: Launch-critical pages keep their primary actions,
  accessible overlays, readable contrast, and overflow-free layouts on
  representative mobile and desktop viewports.
- Why now: SAV-212 fixed the known core accessibility defects; SAV-213 turns
  those expectations into a repeatable browser-level regression gate.

## Slice

- Primary slice: UI, responsive behavior, and accessibility QA.
- Secondary slices: Public acquisition, authentication, dashboard setup,
  interview, feedback, and settings surfaces.
- Relevant skills: `meelni-ui-design-system`,
  `meelni-design-review-orchestrator`, `meelni-question-bank-seo`,
  `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-170.
- Child deliverable issue: SAV-213.
- Current Linear state: In Progress.

## Scope

- In scope: A deterministic mobile/desktop browser matrix for landing,
  Explore, pricing, auth, dashboard, new interview, interview room, feedback,
  and settings; blocking checks for horizontal overflow, primary-action
  reachability, critical automated accessibility findings, and modal
  accessible-name/focus behavior; stored machine-readable evidence and an
  operator-facing runbook.
- Out of scope: Broad visual redesign, provider rehearsals, Production data,
  customer transcripts, schema migrations, new analytics, feature-flag
  changes, and launch authorization.
- Assumptions: Public/auth routes can run against local synthetic state.
  Authenticated surfaces require an explicit test-only fixture boundary that
  is unreachable in deployed builds, rather than shared Preview accounts or
  authentication bypasses.

## Product Lens

- Audience: PM candidates using mobile or desktop, including keyboard,
  screen-reader, low-vision, and motor-impaired users.
- Activation/retention lever: A hidden CTA, overflow, or inaccessible dialog
  directly prevents practice from starting or feedback from being used.
- Product Compass note: Verify the accepted live PM interview practice
  experience and canonical language; do not reintroduce the retired fitness
  framing.

## Technical Plan

- Likely app files: Test-only browser fixture entrypoints or render adapters
  for authenticated launch-critical surfaces, guarded so they cannot ship as
  public product routes.
- Likely package/workflow files: `package.json`, lockfile, Playwright/browser
  configuration, focused browser specifications, evidence writer, and the
  existing CI workflow.
- Data or provider dependencies: None. Use local, synthetic, approved fixtures
  only; no Statsig, Supabase, LiveKit, Stripe, or Production mutation.
- Docs/decisions to update: This intake and a dated browser-matrix operations
  and evidence record documenting coverage, exceptions, and rollback.

## Validation

- Required commands: Focused browser matrix, its fixture/contract tests,
  `npm run check:ci`, `npm run build`, and `git diff --check`.
- Optional/manual checks: Review stored mobile/desktop evidence, keyboard
  order, focus restoration, modal name, strict reflow equivalent, and the
  exact CI artifact contents.
- Fixtures or regression tests needed: Deterministic public API responses and
  synthetic authenticated component state; no customer or Production data.

## Rollout

- Risk level: Medium. The product behavior should stay unchanged, but the new
  CI gate can block merges if its fixture boundary or browser assertions are
  flaky.
- Backward compatibility: Preserve routes, auth decisions, provider
  contracts, analytics, billing, and the relaunch gate.
- Metrics/events to watch: CI duration, browser-test failure rate, and artifact
  availability only. Do not add product analytics.
- Follow-up slice: Triage any non-critical visual polish separately; keep
  launch-critical failures blocking and owner-reviewed.
- Relaunch flag: Keep off. Only the owner makes the launch GO/NO-GO decision.

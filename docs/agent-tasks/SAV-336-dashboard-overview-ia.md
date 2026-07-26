# SAV-336 — Dashboard overview information architecture

## Intent

- User request: Audit and clean up the Overview page from a principal designer
  and design-engineering perspective, especially information architecture and
  spacing.
- Product/user outcome: PM candidates can identify and start the next useful
  mock interview without interpreting repeated dashboard summaries.
- Why now: The current page repeats progress and feedback evidence while a
  non-actionable prep plan adds length without adding a user decision.

## Slice

- Primary slice: Dashboard overview information architecture and spacing.
- Secondary slices: Responsive layout, accessible action naming, and
  design-system reuse.
- Relevant skills: `meelni-ui-design-system`, `meelni-linear-workstream`, and
  `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-335.
- Child deliverable issue: SAV-336.
- Current Linear state: In Progress.

## Scope

- In scope: Lead with the recommendation; keep one latest-score/focus summary,
  one feedback action, and recent interview history; remove duplicate progress
  and planning regions; tighten desktop and mobile spacing.
- Out of scope: Dashboard shell/navigation changes, recommendation algorithms,
  scoring contracts, analytics redesign, or other dashboard routes.
- Assumptions: Analytics owns progress-over-time visualization; Overview owns
  the next decision and only the evidence needed to trust it.

## Product Lens

- Audience: PM candidates returning to practice.
- Activation/retention/monetization/growth lever: Faster return to a relevant
  mock interview.
- Product Compass note: Decision first, evidence second.

## Technical Plan

- Likely app files: `components/dashboard/sections/overview.tsx`.
- Likely test files: `components/dashboard/dashboard-surface.test.tsx`.
- Data or provider dependencies: None.
- Docs/decisions to update: This intake records the bounded design decision; no
  ADR or OpenSpec is needed because product behavior and data contracts do not
  change.

## Validation

- Required commands: Targeted dashboard UI tests, `npm run typecheck`, and
  `npm run lint`.
- Optional/manual checks: Browser harness at 1440×1000 and 390×844.
- Fixtures or regression tests needed: Existing synthetic dashboard fixture.

## Rollout

- Risk level: Low.
- Backward compatibility: Existing recommendation and dashboard summary
  contracts remain unchanged.
- Metrics/events to watch: Existing dashboard and interview-start events.
- Follow-up slice: None unless visual verification exposes a shell-level issue.

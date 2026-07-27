# Dashboard follow-up design cleanup

Status: Implemented and verified on 2026-07-26.

## Intent

- User request: Fix every issue identified in the post-SAV-341 design audit.
- Product/user outcome: History, Analytics, Settings, and destructive account
  actions remain calm, legible, and self-explanatory without incomplete filters,
  repeated evidence, implementation copy, or broken dark-theme controls.
- Why now: A screenshot-backed follow-up found one action-contrast bug and a
  bounded set of residual information-hierarchy issues.

## Slice

- Primary slice: Authenticated dashboard design quality.
- Secondary slices: Responsive history, progress evidence, settings copy, and
  shared dashboard action tokens.
- Relevant skills: `meelni-ui-design-system`,
  `meelni-design-review-orchestrator`, and React best practices.

## Linear Tracking

- Project: Requested as part of the consolidated principal-design cleanup.
- Parent slice issue: Pending connector availability.
- Child deliverable issue: Pending connector availability.
- Current Linear state: The installed connector is not callable in this
  workspace. See `2026-07-27-principal-dashboard-design-cleanup.md`.

## Scope

- In scope: Dashboard token aliases; History filters and compact rows; Analytics
  trend metadata and evidence copy; Settings account, plan, privacy, consent,
  action labels, and deletion-dialog language; targeted automated/browser
  coverage.
- Out of scope: New profile fields, scoring changes, billing policy, analytics
  consent behavior, deletion behavior, or dashboard-shell redesign.
- Assumptions: Existing APIs and lifecycle truth remain authoritative.

## Product Lens

- Audience: PM candidates reviewing practice, understanding progress, or
  managing their account.
- Activation/retention lever: Reduce interpretation and recovery cost in
  repeated dashboard tasks.
- Product Compass note: Present only available actions, label evidence with its
  context, and describe consequences in user language.

## Technical Plan

- Likely app files: Dashboard layout, History, Analytics, Settings, progress
  bars, and shared Button.
- Likely package/workflow files: Dashboard contracts/view models and browser
  fixtures/specs.
- Data or provider dependencies: Existing sessions, insights, billing, consent,
  export, and deletion endpoints only.
- Docs/decisions to update: This task record. No ADR/OpenSpec change because
  behavior and provider contracts remain unchanged.

## Validation

- Required commands: Typecheck, test typecheck, targeted contract/surface tests,
  lint, formatting, design guardrails, and browser-fixture boundary checks.
- Optional/manual checks: In-app browser at 390px, 768px, and 1280px; action
  contrast; History filtering; chart labels; consent selection; deletion focus.
- Fixtures or regression tests needed: Strategy round filtering, labeled scored
  trend, dark dashboard outline actions, and updated Settings copy/control
  semantics.

## Rollout

- Risk level: Low.
- Backward compatibility: Routes, APIs, persistence, lifecycle states, and
  billing/deletion behavior remain unchanged.
- Metrics/events to watch: Existing history views, practice CTA, settings save,
  consent, export, and deletion events.
- Follow-up slice: None expected after responsive verification.

## Result

- History now derives every available round filter, uses one select through the
  tablet breakpoint, removes placeholder question content, and keeps
  unavailable feedback explanations inside the row.
- Analytics now gives every observed score a date, round, and visible value;
  the evidence rail no longer repeats the same recommendation.
- Settings removes non-actionable profile placeholders, clarifies plan and
  action labels, consolidates analytics consent into one choice control, and
  rewrites privacy and deletion content in user language.
- Dashboard semantic aliases and the shared outline button foreground preserve
  legible actions on dark surfaces.

## Verification completed

- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run lint`
- `npm run format:check:quality`
- Targeted dashboard contract, view-model, and surface tests
- Design-system guardrail tests
- Browser-fixture boundary validation
- In-app browser review at 390px, 768px, and 1280px with no horizontal overflow

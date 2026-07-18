# SAV-212 Core Product Accessibility

## Intent

- User request: Complete the Linear-tracked Meelni relaunch-readiness program.
- Product/user outcome: Core navigation, settings, authentication, and dialog
  controls remain operable with keyboard, screen reader, touch, zoom, and
  mobile layouts.
- Why now: SAV-211 closes the feedback-specific accessibility slice; SAV-212
  is the next unblocked cross-product accessibility deliverable under SAV-170.

## Slice

- Primary slice: UI and accessibility.
- Secondary slices: Authentication, dashboard settings, interview setup, and
  shared overlays.
- Relevant skills: `meelni-ui-design-system`,
  `meelni-design-review-orchestrator`, `meelni-linear-workstream`, and
  `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-170.
- Child deliverable issue: SAV-212.
- Current Linear state: In Review in draft PR #342.

## Scope

- In scope: Mobile dashboard and settings navigation, accessible names,
  visible focus, dialog focus containment/restoration and Escape behavior,
  signup legal links, reachable inline action errors, and consistent critical
  touch targets. The active public voice demo is included because it is
  reachable from the homepage.
- Out of scope: Broad visual redesign, SEO work, provider configuration,
  database changes, Production actions, and relaunch-gate changes.
- Assumptions: Shared Radix dialog primitives remain the default for overlays;
  bespoke launch-critical dialogs must match the same behavior contract.

## Product Lens

- Audience: Candidates practicing PM interviews on mobile and desktop,
  including keyboard, screen-reader, low-vision, and motor-impaired users.
- Lever: Activation and retention; inaccessible setup, auth, or settings
  controls prevent practice from starting or account choices from completing.
- Product Compass note: Preserve the accepted live PM interview practice
  positioning and canonical language while improving operability.

## Technical Plan

- App files: Signup, dashboard settings, interview controls, and the setup
  launcher that opens credit dialogs.
- Component files: Shared dialog primitives, the active voice-demo dialog,
  dashboard mobile/settings navigation, and auth surfaces.
- Compatibility repair: Remove the obsolete fourth `RoomServiceClient`
  constructor argument left behind by the approved LiveKit SDK upgrade. The
  deployment workflow continues to enforce its provider timeout in
  `runDeploymentPreflight`.
- Reachability note: `components/dashboard/setup-modal.tsx` and the legacy
  cancellation modal in `components/dashboard/sections/billing.tsx` have no
  current importers. They are excluded from this launch-critical slice and
  should be deleted or migrated in a separate dead-code cleanup if they become
  reachable.
- Data or provider dependencies: None.
- Docs to update: This intake and
  `docs/design/2026-07-18-sav-212-accessibility-evidence.md`.

## Validation

- Required commands: Targeted UI behavior tests, `npm run test:auth-ui`,
  `npm run check:ci`, `npm run build`, and `git diff --check`.
- Manual checks: Keyboard-only walkthrough, focus restoration, Escape,
  accessible dialog names, 390px, strict reflow equivalent, reduced motion,
  and representative touch-target measurement.
- Fixtures: Synthetic/local UI state only; no customer or Production data.

## Rollout

- Risk level: Medium; shared overlay and navigation primitives affect several
  launch-critical routes.
- Backward compatibility: Preserve routes, auth semantics, settings behavior,
  and interview configuration contracts.
- Metrics/events to watch: Existing auth, setup-start, settings, and interview
  activation signals only; do not add analytics before explicit consent.
- Follow-up slice: SAV-213 representative browser QA matrix after the targeted
  SAV-212 fixes are stable.
- Relaunch flag: Keep off. Only the owner makes the launch GO/NO-GO decision.

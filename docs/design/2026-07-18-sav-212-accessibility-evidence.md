# SAV-212 Core Accessibility Evidence

Date: 2026-07-18

## Scope

This acceptance record covers the launch-critical navigation, settings,
authentication, error-recovery, and dialog behavior changed by SAV-212. It
uses synthetic/local state only. No customer transcripts, recordings, or
Production data were accessed.

The relaunch feature gate remained off throughout validation. The public
paused experience and all Production configuration were left unchanged.

## Implemented behavior

- Dashboard users have the same destinations on mobile and desktop, with a
  horizontally scrollable mobile workspace navigation that exposes the
  current page.
- Shared and launch-critical dialogs have accessible names, viewport-safe
  bounds, 44px close controls, keyboard focus containment, Escape behavior,
  and deterministic focus restoration.
- Signup exposes truthful Terms and Privacy draft links without claiming
  agreement, and validation errors are adjacent, assertive, and referenced by
  each affected password input with `aria-invalid` and `aria-describedby`.
- Auth, settings, drawer, interview-ending, and error-recovery actions meet the
  critical touch-target and visible-focus contract.
- Status and error changes are announced without adding new analytics or
  changing provider, billing, authentication, or interview contracts.
- Motion-heavy transitions respect reduced-motion preferences.

## Automated acceptance

All commands ran with the repository-pinned Node 22.22 runtime.

| Check                           | Result                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run test:auth-ui`          | Pass: 16 Node UI tests and 32 Vitest tests                                                                         |
| `npm run test:deploy-preflight` | Pass: 29 deployment-preflight and 8 provider-client tests                                                          |
| `npm run check:ci`              | Pass: security scan reported 0 findings; lint retained four pre-existing warnings outside this slice and no errors |
| `npm run build`                 | Pass: 65 pages and 78 routes; public source/build verification passed                                              |
| `git diff --check`              | Pass                                                                                                               |

The LiveKit SDK compatibility repair in `scripts/deployment-preflight.ts`
removes an obsolete constructor argument exposed by the approved SDK upgrade;
the existing deployment-preflight timeout remains enforced by
`runDeploymentPreflight`.

## Browser acceptance

Chrome exercised the exact local production build at `http://localhost:3212`
with Preview environment values and synthetic form data.

### 390 x 844

- Document and body `scrollWidth` equaled `clientWidth` (390px).
- Sign Up was 308 x 44px, Continue with Google was 308 x 56px, and the Terms,
  Privacy, and Sign in actions were each 44px tall.
- Submitting mismatched synthetic passwords rendered `Passwords do not match`
  as an alert referenced by both Password and Confirm Password through
  `aria-describedby`; both inputs exposed `aria-invalid="true"`.
- Keyboard focus advanced from Sign Up to Continue with Google and displayed a
  visible focus ring fully inside the viewport.
- Evidence: `sav212-local/signup-390-error.jpg` in the local design evidence
  directory.

### Strict 195 x 422 reflow equivalent

- Document and body `scrollWidth` equaled `clientWidth` (195px); no horizontal
  overflow was present.
- Every visible signup, legal, sign-in, and back action remained within the
  viewport and at least 44px tall.
- The narrow viewport intentionally scrolls vertically; content is not clipped
  or forced into two-dimensional scrolling.
- Evidence: `sav212-local/signup-195-reflow.jpg` in the local design evidence
  directory.

### Feature-gated surfaces

The relaunch gate correctly rendered the paused public experience during the
browser run. Dashboard navigation and the public demo dialog therefore used
direct component behavior tests rather than bypassing or enabling the gate.
Those tests cover the mobile navigation contract, accessible dialog name,
focus containment/restoration, Escape handling, viewport bounds, and loading
guards.

## Reachability and follow-up

`components/dashboard/setup-modal.tsx` and the legacy cancellation modal in
`components/dashboard/sections/billing.tsx` have no current importers. They
remain outside the launch-critical SAV-212 surface and should be deleted or
migrated in a separate dead-code cleanup before reuse.

SAV-213 remains the broader representative browser/assistive-technology QA
matrix. SAV-212 should stay In Review until its PR is reviewed and merged.

## Rollout and rollback

- Merge independently of launch; do not enable the relaunch flag.
- Observe existing auth, setup-start, settings, and interview activation
  signals only after the owner authorizes launch.
- Roll back by reverting the SAV-212 commit. No schema, provider, or data
  migration is required.

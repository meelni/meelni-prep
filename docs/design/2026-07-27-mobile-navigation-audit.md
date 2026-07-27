# SAV-359 Mobile Navigation Audit

## Goal

Make mobile navigation predictable, complete, and action-oriented for both the public site and the signed-in workspace, while keeping “New Mock Interview” within one easy thumb-reachable action.

## Decision

Global navigation now uses a full-height left-side rail. The previous bottom sheet mixed a task-local interaction pattern with app-wide information architecture, exposed too few destinations, and competed with the bottom edge where mobile users expect contextual actions and system gestures.

The shared rail:

- opens from the same side as the hamburger trigger and preserves one top-to-bottom scan path;
- occupies at most 88% of the viewport and 22rem, retaining spatial context;
- respects top and bottom safe areas;
- traps focus, closes on Escape, restores focus to the trigger, and supports reduced motion;
- keeps destination content scrollable while the action footer remains fixed.

## Information architecture

### Public site

The public rail answers discovery questions in this order:

1. How it works
2. Questions
3. Companies
4. Pricing
5. Blog
6. Contact

The fixed footer keeps the activation action and Log In separate from informational navigation. Signed-in visitors instead receive a direct Dashboard action.

### Signed-in workspace

The workspace rail contains:

1. Overview
2. Question Bank
3. Interview History
4. Progress
5. Settings

The current destination is explicit. A full-width “New Mock Interview” action remains fixed at the bottom of the rail, while a compact microphone action in the mobile header provides one-tap launch without opening navigation. Account identity and sign-out are grouped below the primary action.

## Audited flow

1. Public landing header — hamburger remains visually familiar and meets the 44px touch-target contract.
2. Public navigation rail — complete discovery IA, fixed activation footer, no horizontal overflow at 320px.
3. Signed-in mobile header — one row with menu, current page label, and one-tap interview launch.
4. Workspace navigation rail — current-location state, complete workspace IA, persistent interview action, and account controls.
5. Dismissal and return — scrim, close control, Escape dismissal, and focus restoration all behave consistently.

## Verification

- Production browser QA: 70 passed, 9 intentionally skipped.
- Targeted mobile navigation QA: landing, pricing, and dashboard passed.
- Type checks, lint, navigation unit tests, dashboard layout tests, and design-system guardrails passed.
- Manual browser checks passed at 320px, 390px, and 430px, including safe-area containment and zero horizontal overflow.

## Evidence

Screenshots are saved in:

`docs/design/screenshots/2026-07-27-mobile-navigation-audit/`

- `02-public-menu-open-before.jpg`
- `04-dashboard-menu-open-before.jpg`
- `06-dashboard-menu-open-after.jpg`
- `07-public-menu-open-after.jpg`
- `08-public-menu-open-after-320.jpg`

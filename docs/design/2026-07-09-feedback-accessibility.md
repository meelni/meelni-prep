# Feedback accessibility and consent-safe layout

Status: implementation and verification plan for SAV-211
Scope: feedback result, partial, insufficient, loading, failed, and consent states

## Product decision

Feedback remains a focused dark review workspace in both app theme settings.
The workspace owns contrast-safe semantic colors instead of inheriting the
lighter marketing palette. This keeps scores, statuses, evidence, and next
steps readable without making feedback presentation depend on the user's system
theme.

The owned theme covers foreground/background pairings used by shared
primitives—not only status text. Primary, outline, secondary, destructive, and
hover button pairs plus metric-card values and labels must each meet WCAG AA
4.5:1 contrast.

The optional analytics decision is a document-flow notice before primary
content, not a floating overlay. At narrow widths and 200% zoom its actions
stack. An undecided notice may make the page taller, but it cannot cover a
feedback action, dashboard control, or marketing CTA. Accepted and declined
states remove the notice.

SAV-211 is stacked on the explicit consent contract in SAV-180 / PR #324. This
slice changes placement and responsive presentation only; SAV-180 remains the
authority for whether analytics may initialize and how a decision persists.

Comparison treats the earlier attempts as one radio group, including arrow-key
movement, because exactly one earlier attempt may be compared at a time. The
newest returned attempt is fixed context and renders as static content rather
than a disabled or falsely interactive control, even when comparison is opened
from an older feedback URL. A changed radio choice cancels and supersedes the
prior comparison request. Comparison failures own an announced retry state
without discarding the loaded attempt choices.

## State matrix

| State                       | Surface                                              | Required behavior                                                    |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Complete                    | Review shell, score, evidence, next step, transcript | AA text contrast; unbroken evidence wraps; no horizontal page scroll |
| Partial                     | Warning card inside review shell                     | Limitation remains prominent and readable                            |
| Insufficient / skipped      | Status page                                          | No scores; reason and recovery action wrap                           |
| Pending / processing        | Status page and progress card                        | Progress has an accessible state and status text remains readable    |
| Failed                      | Danger status page                                   | Error and retry/back actions remain available at narrow widths       |
| Consent undecided           | Document-flow notice before page content             | Never overlays primary content; actions stack at narrow widths       |
| Consent accepted / declined | No notice                                            | Page uses its normal layout                                          |

## Automated evidence

- `npm run test:ui` calculates contrast ratios for feedback semantic text
  tokens and shared button/metric foreground-background pairings.
- The UI command runs Node contract tests and Vitest/jsdom page behavior through
  their correct runners. The comparison-page behavior fixture verifies valid
  link semantics, earlier-attempt radio semantics and keyboard movement, static
  latest-attempt context, out-of-order response rejection, comparison retry,
  busy loading status, and reduced-motion spinner behavior.
- Shared-surface rendering checks guard responsive wrapping, horizontal
  containment, status action wrapping, and the focused theme variables.
- Feedback outline boundaries are held to at least 3:1 non-text contrast; the
  analytics decline action uses a foreground-relative boundary in both themes.
- The consent layout contract checks that the notice renders before primary
  content and cannot regain fixed, sticky, or absolute positioning.
- `npm run check:ci` includes `test:ui`; `npm run build` remains the production
  rendering gate.

## Browser verification

Use local fixture responses only. Do not generate provider feedback or touch
Preview or Production data.

1. Exercise complete, partial, insufficient/skipped, pending, and failed states
   at 390×844 and 1440×900.
2. Repeat with light and dark app themes. The feedback workspace remains dark;
   the check verifies contrast rather than a palette switch.
3. Repeat at 200% browser zoom and verify no horizontal page scroll, clipped
   evidence, or unreachable action.
4. Exercise undecided, accepted, and declined analytics consent. The undecided
   notice must precede content in normal flow; decided states must remove it.

Record completed screenshots and measurements in the SAV-211 Linear thread and
PR before moving the issue out of review.

Completed local evidence:

- The fixture-only route used for verification was removed after the browser
  run; it made no provider feedback calls and used no customer or Production
  data.
- Complete, partial, insufficient, loading, and failed feedback states fit a
  390×844 viewport with `scrollWidth === clientWidth`; every primary and
  recovery action rendered.
- At the 195×422 CSS-viewport equivalent of 200% zoom, insufficient feedback
  and the consent surface remained horizontally contained and their actions
  remained reachable.
- The undecided consent notice ended exactly where feedback content began
  (`overlap: 0`) and declining removed the notice while leaving feedback
  actions visible.
- Local accepted and declined fixture states each removed the notice without
  hiding the primary action.
- Light and dark media preferences both resolved feedback to the audited
  `#1c1c21` background, `#f2f2f7` foreground, and `#b5b5c4` muted foreground.
- No Next.js error overlay or browser page error was present during the run.
- The comparison no-attempts state was rechecked at a 320×844 CSS viewport
  after removing overflow masking. The root and body each reported
  `scrollWidth === clientWidth` (`315px` after the browser scrollbar); Back to
  Feedback, Start Another Interview, View Feedback, Decline, and Allow
  analytics all remained horizontally contained. The two comparison actions
  stacked, `a button, button a` matched nothing, and consent overlap remained
  zero.
- That comparison check rendered the exported production state through a
  temporary local-only route with synthetic public configuration. The route
  was removed immediately after measurement; no Supabase, provider, customer,
  Preview, or Production data was read or written.

## Rollout

- Keep the relaunch feature flag off by default.
- Merge the explicit consent contract before this dependent slice.
- No database migration, provider call, remote data mutation, or feature-flag
  activation is required for this UI change.

# Feedback accessibility and consent-safe layout

Status: implementation evidence for SAV-211
Scope: feedback result, partial, insufficient, loading, failed, and consent states

## Product decision

Feedback remains a focused dark review workspace in both app theme settings. The
workspace owns contrast-safe semantic colors instead of inheriting the lighter
marketing palette. This keeps scores, statuses, evidence, and next steps
readable without making feedback presentation depend on the user's system
theme.

The owned theme includes foreground/background pairings used by shared
primitives—not only status text. Primary, outline, secondary, destructive, and
hover button pairs plus metric-card values and labels must each meet 4.5:1.
This prevents a light marketing `--background` or `--primary-foreground` from
silently entering the dark review workspace.

The optional analytics decision is a document-flow notice before primary
content, not a floating overlay. At narrow widths and 200% zoom its actions
stack. An undecided notice may make the page taller, but it cannot cover a
feedback action, dashboard control, or marketing CTA. Accepted and declined
states remove the notice.

SAV-211 depends on the explicit consent contract in SAV-180 / PR #253. This
slice changes placement and responsive presentation only; SAV-180 remains the
authority for whether analytics may initialize and how a decision persists.

## State matrix

| State                       | Surface                                              | Required behavior                                                      |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Complete                    | Review shell, score, evidence, next step, transcript | AA text contrast; unbroken evidence wraps; no horizontal page scroll   |
| Partial                     | Warning card inside review shell                     | Limitation remains prominent and readable                              |
| Insufficient / skipped      | Status page                                          | No scores; reason and recovery action wrap                             |
| Pending / processing        | Status page and progress card                        | Progress has an accessible name/value and status text remains readable |
| Failed                      | Danger status page                                   | Error and retry/back actions remain available at narrow widths         |
| Consent undecided           | Document-flow notice before page content             | Never overlays primary content; actions stack at narrow widths         |
| Consent accepted / declined | No notice                                            | Page uses its normal layout                                            |

## Automated evidence

- `npm run test:ui` calculates WCAG contrast ratios for every feedback semantic
  text token and every shared button/metric foreground-background pairing.
- Shared-surface rendering checks guard responsive wrapping, horizontal
  containment, status action wrapping, and the focused theme variables.
- The consent layout contract checks that the notice renders before primary
  content and cannot regain fixed, sticky, or absolute positioning.
- `npm run check:ci` includes `test:ui`; `npm run build` remains the production
  rendering gate.

## Browser verification

Use local fixture responses only. Do not generate provider feedback or touch
Preview/Production data.

1. Exercise complete, partial, insufficient/skipped, pending, and failed states
   at 390×844 and 1440×900.
2. Repeat with light and dark app themes. The feedback workspace remains dark;
   the test verifies contrast rather than a palette switch.
3. Repeat at 200% browser zoom and verify no horizontal page scroll, clipped
   evidence, or unreachable action.
4. Exercise undecided, accepted, and declined analytics consent. The undecided
   notice must precede content in normal flow; decided states must remove it.

Completed local evidence:

- A fixture-only local preview (removed after verification) exercised complete,
  partial, insufficient, loading, and failed shared feedback surfaces.
- At 390×844 and the 195×422 CSS-viewport equivalent of 200% zoom, every state
  reported `scrollWidth === clientWidth`; both actions remained present.
- The consent notice ended exactly where primary content began (`overlap: 0`) at
  mobile, desktop 1440×900, and the zoom-equivalent viewport.
- Accept and Decline each removed the notice. The undecided state remained in
  normal document flow and produced no horizontal overflow.
- Browser-emulated light and dark preferences both resolved the focused review
  workspace to the same audited foreground, muted, primary, success, warning,
  info, and destructive tokens. Temporary viewport and media overrides were
  reset after the run.

## Rollout

- Keep the relaunch feature flag off by default.
- Merge the explicit consent contract before or with this dependent slice.
- No database migration, provider call, remote data mutation, or feature-flag
  activation is required for this UI change.

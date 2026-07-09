# 2026-07-08 Agent Design System Maturity

## Purpose

This document turns Meelni's design direction into an operating system for coding agents. It is intentionally practical: an agent should be able to decide which shell, primitive, button variant, state model, and validation path to use before touching JSX.

## Maturity Standard

Meelni is mature when UI work has these properties:

- Route family is obvious before implementation starts.
- One primary user action is visible in each scope.
- Shared primitives carry repeated visual decisions.
- Local markup is mostly layout glue, not a new component language.
- Required states are included or intentionally ruled out.
- Guardrails catch drift before review.
- Docs explain decisions with enough specificity that another agent can continue quickly.

## Current Action Audit

Snapshot from this workstream:

- `Button` JSX usage in `app`, `components`, and `lib`: 176 call sites.
- Raw native button or `motion.button` opening tags: 7 call sites.
- Raw-button files are currently limited to primitive/control internals plus one motion-specific demo modal control group:
  - `components/ui/selectable-card.tsx`
  - `components/ui/filter-pill.tsx`
  - `components/ui/segmented-control.tsx`
  - `components/dashboard/dashboard-surface.tsx`
  - `components/demo-modal.tsx`

Interpretation:

- The system is healthy enough that ordinary actions mostly use `Button`.
- The remaining maturity gap is not "replace every raw button." It is "freeze raw buttons to approved primitives/control groups and make new page code use shared actions by default."
- `Button` had an unused local `orange` variant; it was removed to keep the action API intentional.

## Action Hierarchy

Use `Button` for ordinary actions. Pick variants by product role:

| Role                      | Variant       | Use                                                                  | Avoid                                           |
| ------------------------- | ------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Primary                   | `default`     | One main action inside a page, modal, card, or toolbar               | Multiple competing primary buttons in one scope |
| Launch/marketing emphasis | `glow`        | High-emphasis start/demo/purchase CTAs where visual energy is useful | Routine dashboard actions                       |
| Secondary                 | `outline`     | A useful alternative to the primary action                           | Making low-risk utility actions look heavy      |
| Tertiary/navigation       | `ghost`       | Back, collapse, dismiss, reveal, inline row utility                  | Primary conversion actions                      |
| Text navigation           | `link`        | Inline or article-style navigation                                   | Button bars or dense toolbars                   |
| Quiet utility             | `quiet`       | Low-emphasis product utility where muted treatment is needed         | Marketing CTAs                                  |
| Destructive               | `destructive` | Delete, cancel subscription, end irreversible flow                   | Normal failure recovery                         |

Rules:

- One primary per scope.
- Icon-only actions use `Button size="icon"` with `aria-label` or `title`.
- Familiar tools should use lucide icons rather than text pills.
- Segmented controls, filters, and selectable tiles should use `SegmentedControl`, `FilterPill`, `SelectableCard`, tabs, or a domain primitive.
- Do not add one-off button variants. If a treatment repeats, create or extend a domain primitive.

## Shell Decision Matrix

| Route family              | Required shell                                       | Primary primitives                                                               | Notes                                                                    |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Dashboard workspace       | `app/dashboard/layout.tsx` + dashboard content panel | `DashboardPage`, dashboard surfaces, `Button`, `StatusPill`                      | Authenticated sidebar pages and `/dashboard/new-interview`               |
| Feedback review workspace | `FeedbackReviewShell` or `FeedbackStatusPage`        | Feedback surfaces, `Button`, `StatusPill`                                        | Result, loading, skipped, partial, insufficient, abandoned, compare      |
| Focused interview room    | Full-screen room chrome                              | Interview controls, transcript rail, `Button`, `StatusPill`, app-surface headers | Intentional exception; no dashboard sidebar                              |
| Auth flow                 | `AuthShell`                                          | Auth shell/card/message primitives, form controls, `Button`                      | Sign in, sign up, forgot password, reset password                        |
| Public/content            | Marketing/content primitives                         | Marketing surfaces, article/prose, `Button`, question-bank primitives            | Do not borrow authenticated shells                                       |
| Compatibility redirect    | Redirect only                                        | None                                                                             | `/setup` and `/dashboard/new-rep` redirect to the canonical launch route |

## Component Composition Rules

Use this order:

1. Domain composition already in the relevant folder.
2. Shared primitive from `components/ui`.
3. New domain primitive when the pattern repeats or encodes product meaning.
4. Local semantic markup for one-off layout glue only.

Before inventing a structure, compare against `docs/design/2026-07-08-canonical-ui-patterns.md`. The examples there are production references, not aspirational mockups.

Do not:

- Put cards inside cards.
- Recreate route shells inside route pages.
- Use raw color families when semantic tokens exist.
- Add arbitrary font sizes when a named utility fits.
- Add decorative motion before hierarchy and state are clear.
- Copy from `app/test-*` or dev-only surfaces into product routes.

## State Coverage

For each meaningful workflow, account for:

- Loading.
- Empty or first-use.
- Error and recovery.
- Disabled, permission, or entitlement.
- Success or completion.
- Mobile and desktop.
- Keyboard and screen-reader affordances.

Feedback, dashboard, auth, New Mock Interview setup, and interview already have domain primitives for most of these. Use them before local state markup.

## Guardrail Strategy

Use guardrails for durable rules that agents are likely to forget:

- Token misuse.
- Raw action primitives outside approved exceptions.
- Legacy route targets such as `/setup`.
- Route family shell regressions.
- Feedback/dashboard/public primitive drift.
- Required documentation sections for the design-system operating model.

Avoid guardrails for subjective taste or highly local copy decisions.

## Agent Checklist

Before editing UI:

1. Classify route family.
2. Name the scope's primary action.
3. Choose shared primitives.
4. Pick the closest canonical example.
5. Confirm required states.
6. Check responsive constraints and scroll owner.
7. Decide whether drift is local or systemic.
8. If systemic, update docs and guardrails in the same change.

## External Design Lenses

Use external skill ecosystems as second-opinion lenses, not as new sources of truth. The routing policy lives in `docs/design/2026-07-08-external-design-lenses.md`, and the agent workflow lives in `meelni-design-review-orchestrator`.

- Impeccable: recommended pilot for structured audit, polish, hardening, and detector baseline work.
- ibelick/ui-skills: borrow tactical accessibility, motion performance, metadata, and baseline cleanup rules.
- Taste Skill: use for public/content art direction and anti-generic marketing critique; avoid for dashboard, interview, feedback, auth, settings, billing, or data-heavy product surfaces.

Conflict rule: Meelni's product behavior, route taxonomy, shared primitives, semantic tokens, and icon conventions win.

## Remaining Maturity Opportunities

- Keep remaining raw button exceptions limited to primitive internals and the demo modal's motion-specific interview controls.
- Keep authenticated screenshot evidence current when route shells change; the first desktop/mobile set lives in `docs/design/screenshots/2026-07-08-authenticated-qa/`.
- Run a manual Impeccable detector/audit pilot before enabling hooks or CI.
- Tighten observability/runtime noise separately from design-system structure: local CSP currently blocks the web-vitals CDN script, Statsig may emit SDK exception calls in dev, and headless LiveKit checks report expected audio support/disconnect messages.
- Continue the public/content audit in `SAV-154`.
- Consider a small `ActionBar` or `PageActions` primitive only after repeated action clusters stabilize.

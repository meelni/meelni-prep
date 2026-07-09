# 2026-07-08 External Design Lenses

## Purpose

Meelni can benefit from external design-audit ecosystems, but they should sharpen our system rather than replace it. This note defines how agents should use Impeccable, ibelick/ui-skills, and Taste Skill inside Meelni's product-specific design workflow.

## Source Of Truth

Authority order:

1. PM interview product behavior and user trust.
2. `DESIGN.md`.
3. Product-container taxonomy and canonical examples in `docs/design/`.
4. Meelni shared primitives and semantic tokens.
5. External design-audit lenses.

If an external lens conflicts with Meelni route shells, `lucide-react`, dashboard/feedback/interview primitives, or PM interview workflow clarity, Meelni wins.

## Lens Roles

| Lens              | Status              | Best use                                                                                                             | Avoid                                                                                              |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Impeccable        | Recommended pilot   | Structured product/brand audit, detector baseline, accessibility/performance/theming/responsive/anti-pattern scoring | Enabling hooks or CI before false positives are reviewed                                           |
| ibelick/ui-skills | Borrow selectively  | Tactical accessibility, motion performance, baseline cleanup, metadata checks                                        | Replacing `meelni-ui-design-system` as the router                                                  |
| Taste Skill       | Public/content only | Marketing art direction, anti-generic public-page critique, reference boards                                         | Dashboard, New Mock Interview, interview, feedback, auth, settings, billing, data-heavy product UI |

## Integration Policy

### Impeccable

Use Impeccable first when the task is a formal audit, critique, polish, hardening, layout, typesetting, or detector pilot.

Adoption path:

1. Run manual detector/audit checks on representative routes.
2. Compare findings against `DESIGN.md` and current guardrails.
3. Configure ignores for intentional Meelni choices.
4. Convert validated findings into Linear issues.
5. Consider hooks or CI only after the baseline is trusted.

Do not run `npx impeccable install` with hooks enabled as part of routine UI work. Hook installation is a separate rollout decision.

### ibelick/ui-skills

Borrow rules that are stable and compatible with Meelni:

- Existing project primitives first.
- Accessible names for icon-only controls.
- Structural skeletons for loading states.
- Dynamic viewport units instead of `h-screen` for full-height surfaces.
- Safe-area awareness for fixed controls.
- Inline/local error placement.
- Motion on state changes, not decorative churn.
- Avoid layout-property animation for interaction feedback.

Keep this as a checklist. Do not add the `ui-skills` router unless Meelni's own skill routing becomes insufficient.

### Taste Skill

Taste Skill is useful for public-facing creativity, but its default guidance is not a fit for Meelni's authenticated product UI.

Use it for:

- Landing and pricing page critique.
- Blog/company/public content polish.
- Reference-board generation for marketing direction.
- Anti-generic reviews for public conversion surfaces.

Do not use it to drive:

- Dashboard workspace.
- New Mock Interview flow.
- Focused interview room.
- Feedback review.
- Authenticated settings, billing, or admin-like UI.

## Agent Workflow

1. Load `meelni-ui-design-system`.
2. Load `meelni-design-review-orchestrator` only when an external lens is useful.
3. Classify the route family.
4. Pick one external lens, two at most.
5. Record conflicts and why Meelni won.
6. If the lens finds systemic drift, update docs/guardrails and Linear.

## Rollout

Current state:

- Meelni owns the wrapper skill and adoption guidance.
- External detector output is advisory.
- Hooks and CI are not enabled.

Next safe step:

- Run a manual Impeccable detector/audit pilot on the existing authenticated screenshot set and public/content route set, then classify findings as valid, false positive, or already covered by Meelni guardrails.

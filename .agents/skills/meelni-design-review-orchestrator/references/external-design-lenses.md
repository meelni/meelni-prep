# External Design Lenses

These lenses are useful, but none are the source of truth for Meelni. Treat them as advisory inputs that sharpen Meelni's own design system.

## Impeccable

Use for:

- Structured product or brand audits.
- Technical design quality checks: accessibility, performance, theming, responsiveness, anti-patterns.
- Manual detector pilots before considering hooks or CI.
- Final polish or hardening passes where the route family is already correct.

Why it fits Meelni:

- It has a product register that values earned familiarity, restraint, consistent affordances, semantic states, and task flow.
- Its audit model scores accessibility, performance, theming, responsive behavior, and anti-patterns.
- Its detector can catch recurring AI-generated UI tells, but only after project-specific false positives are reviewed.

Adoption path:

1. Run a manual detector/audit pilot on representative routes.
2. Compare findings against `DESIGN.md` and existing guardrails.
3. Configure ignores for intentional Meelni choices.
4. Track follow-up issues for validated findings.
5. Consider hooks or CI only after the detector baseline is trusted.

Do not:

- Enable hooks by default in this repo.
- Let Impeccable rewrite `DESIGN.md` or replace Meelni skill instructions.
- Treat detector findings as blocking before calibration.

## ibelick/ui-skills

Use for:

- Tactical baseline cleanup.
- Accessibility review for names, labels, keyboard access, focus, forms, errors, and dialogs.
- Motion performance review.
- Metadata checks on public/content pages.

Borrowed rules that fit Meelni:

- Use existing project primitives first.
- Add accessible names to icon-only controls.
- Prefer structural skeletons over centered spinners.
- Avoid `h-screen`; use dynamic viewport units where full-height layouts are needed.
- Respect safe areas for fixed controls.
- Show errors next to the action or field that caused them.
- Animate state with restraint; avoid layout-property animation for interaction feedback.

Use as a checklist, not as an installed router. Meelni already has `meelni-ui-design-system` for routing.

## Taste Skill

Use for:

- Public marketing, landing, pricing, blog, company, and campaign critique.
- Reference-board or image-generation prompts for public surfaces.
- Anti-generic design critique when a public page feels templated.
- A targeted redesign lens for public/content routes.

Avoid for:

- Dashboard workspace.
- New Rep flow.
- Live interview room.
- Feedback review.
- Authenticated settings, billing, or data-heavy product tools.

Important conflict notes:

- Taste Skill's default skill says it is for landing pages, portfolios, and redesigns, not dashboards, data tables, or multi-step product UI.
- It discourages `lucide-react`, but Meelni intentionally uses lucide for familiar product controls. Meelni wins.
- It may recommend more expressive motion, imagery, asymmetry, icon swaps, or visual novelty than authenticated product UI should use. Product task clarity wins.

## Surface Routing

| Surface | Primary lens | Secondary lens | Notes |
| --- | --- | --- | --- |
| Dashboard | Meelni + Impeccable product | ui-skills accessibility/motion | Keep dense, calm, repeated-task UI. |
| New Rep | Meelni + Impeccable product | ui-skills accessibility | Optimize activation and decision clarity. |
| Interview room | Meelni only, with ui-skills motion/a11y | Impeccable audit | Focused runtime; avoid external visual novelty. |
| Feedback review | Meelni + Impeccable product | ui-skills accessibility | Prioritize trust, hierarchy, and comparison clarity. |
| Auth | Meelni + Impeccable product | ui-skills accessibility | Calm account flow, no marketing detours. |
| Public marketing/pricing | Meelni + Taste Skill | Impeccable brand/product audit | Taste can stretch direction; Meelni primitives ship it. |
| Blog/company/docs/SEO | Meelni + Taste Skill | ui-skills metadata/a11y | Public content polish and discoverability. |

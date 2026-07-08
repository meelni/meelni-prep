# External Design Lens Adoption

Status: accepted

Date: 2026-07-08

## Context

Meelni now has a product-specific design system, route taxonomy, shared primitives, and guardrails. The team also wants to benefit from external agent design ecosystems:

- Impeccable for structured audits, detector rules, and product/brand critique.
- ibelick/ui-skills for focused accessibility, motion-performance, metadata, and baseline cleanup rules.
- Taste Skill for stronger public-facing art direction and anti-generic design critique.

These tools are useful, but several rules conflict with Meelni's accepted product choices. For example, Taste Skill discourages `lucide-react`, while Meelni intentionally standardizes on lucide icons for familiar product controls. Taste Skill also targets landing pages and redesigns rather than dashboards or multi-step product UI.

## Decision

Meelni will adopt external design ecosystems as calibrated advisory lenses, not as the design authority.

Authority order:

1. PM interview product behavior and user trust.
2. `DESIGN.md`.
3. Product-container taxonomy and canonical examples.
4. Meelni shared primitives and semantic tokens.
5. External design-audit lenses.

Implementation:

- Add `meelni-design-review-orchestrator` as the wrapper skill for external design-audit usage.
- Update `meelni-ui-design-system` so agents route external design audits through the wrapper.
- Document the integration policy in `docs/design/2026-07-08-external-design-lenses.md`.
- Keep third-party hooks and CI checks disabled until a manual detector baseline is reviewed.

## Consequences

Positive:

- Agents can use stronger audit language and detector ecosystems without eroding Meelni's product-specific UI.
- Impeccable can be piloted safely before hooks/CI become blocking.
- Taste Skill remains useful for public/content creativity without contaminating authenticated product workflows.
- ui-skills rules become a tactical checklist rather than another router.

Tradeoffs:

- External tools require calibration before automation.
- Some external recommendations will be intentionally rejected because Meelni prioritizes PM interview task clarity and consistency.
- Future agents must record conflicts instead of blindly following whichever skill was loaded most recently.

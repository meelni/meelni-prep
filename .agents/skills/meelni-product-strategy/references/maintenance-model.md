# Maintenance Model

Keep the Product Compass skill maintainable by separating stable workflow from changing product truth.

## Keep Stable

These should change rarely:

- Head of Product stance
- problem definition workflow
- PM interview wedge lens
- growth and monetization lens
- AI product strategy lens
- tradeoff evaluation lens
- output lane model

## Keep Current

Update these when Meelni evolves:

1. `references/meelni-product-model.md`
2. `references/system-awareness.md`
3. `docs/decisions/current.md`
4. `references/output-playbook.md`
5. main `SKILL.md` only when the workflow itself should change

## Update Triggers

- beachhead or audience changes
- pricing, trial, or packaging changes
- major SEO/question-bank strategy changes
- major voice interview runtime changes
- major feedback/evaluation changes
- enterprise strategy moves from optionality to active build
- AI/agent learning expansion becomes a shipped product track
- repeated mismatch between Product Compass recommendations and user expectations

## Audit Checklist

When auditing Product Compass, compare references against:

- `.claude/PRD.md`
- `AGENTS.md`
- `docs/decisions/current.md`
- `docs/operations/skills.md`
- `docs/architecture/target-monorepo.md`
- active product pages and workflows under `app/`
- current skills under `.agents/skills/`

## Rule

Prefer updating small reference files over rewriting the main skill body.

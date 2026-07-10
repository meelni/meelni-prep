---
name: meelni-design-review-orchestrator
description: Use when auditing, critiquing, polishing, or planning Meelni UI with external design-audit lenses such as Impeccable, ibelick/ui-skills, or Taste Skill while keeping Meelni's design system authoritative.
---

# Meelni Design Review Orchestrator

Use this skill when a Meelni UI task needs an external design-audit lens, a second-opinion critique, or a design-system adoption decision.

## Required Order

1. Load `meelni-ui-design-system` first. Meelni route taxonomy, primitives, tokens, and product behavior remain authoritative.
2. Read `references/external-design-lenses.md`.
3. Classify the surface:
   - Product UI: dashboard, New Mock Interview, interview room, feedback, auth, settings, billing, tools.
   - Public/content UI: landing, pricing, blog, company, docs, SEO, legal, contact.
4. Pick the smallest useful lens:
   - Impeccable: structured product/brand audit, technical quality checks, detector pilot.
   - ui-skills: tactical accessibility, motion performance, baseline cleanup rules.
   - Taste Skill: public/content art direction, marketing redesign critique, reference-board generation.
5. Resolve conflicts in this order:
   1. Product behavior and PM interview workflow.
   2. Meelni `DESIGN.md` and route/container taxonomy.
   3. Existing Meelni primitives and semantic tokens.
   4. External lens recommendations.

## Operating Rules

- Do not run third-party installers or enable hooks unless the user explicitly asks or a Linear issue scopes that rollout.
- Do not let external skills replace Meelni primitives, `lucide-react`, route shells, or dashboard/feedback/interview composition rules.
- Treat external detector output as advisory until false positives are configured and reviewed.
- For product UI, prefer restrained, task-focused product quality over expressive visual novelty.
- For public/content UI, Taste Skill can challenge generic layouts, but final output must still use Meelni marketing/content primitives.
- Record durable adoption decisions in docs and Linear.

## Output

Use:

```markdown
## Lens
- Meelni surface:
- External lens used:
- Conflict resolution:

## Findings
- P0/P1:
- P2/P3:
- Positive patterns:

## Actions
- Repo changes:
- Follow-up issues:
- Validation:
```

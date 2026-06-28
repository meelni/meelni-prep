---
name: meelni-codebase-architecture
description: Review or improve Meelni architecture, package boundaries, monorepo migration, module ownership, provider adapter shape, testability, or agent-friendly code organization.
---

# Meelni Codebase Architecture

Use this skill for architecture review, package migration, adapter boundaries, and changes that make Meelni easier for humans and agents to evolve.

## Read First

- `AGENTS.md`
- `docs/architecture/codebase-principles.md`
- `docs/architecture/target-monorepo.md`
- `docs/decisions/current.md`
- Relevant contracts in `docs/contracts/`
- Relevant OpenSpec specs or active changes under `openspec/`

## Workflow

1. Identify the product slice: question bank, setup/session lifecycle, LiveKit interview runtime, transcript capture, feedback/evaluation, dashboard insights, billing/usage, SEO/public content, or local tooling.
2. Map the current files, callers, provider dependencies, and state transitions.
3. Check dependency direction:
   - app routes stay thin;
   - provider payloads normalize at boundaries;
   - shared behavior moves toward `packages/core`, `packages/agent`, or `packages/integrations`;
   - package consumers use public entrypoints.
4. Propose small migration candidates. For each, name files, friction, target boundary, tests, and rollout risk.
5. Recommend one first move that improves locality or testability without blocking the live product.

## Output

Use:

```markdown
## Findings
- [severity] file:line - issue, impact, suggested direction.

## Candidates
- Candidate:
- Files:
- Current friction:
- Proposed change:
- Test impact:
- Risk:

## Recommendation
- First move:
- Validation:
```

---
name: meelni-pr-prep
description: Prepare meaningful Meelni changes for PR by checking validation, docs, decisions, contracts, OpenSpec, skills, migration boundaries, and user-facing risk.
---

# Meelni PR Prep

Use this skill before opening or finalizing a meaningful PR.

## Read First

- `AGENTS.md`
- `docs/operations/tooling.md`
- `docs/decisions/current.md`
- Relevant docs, contracts, specs, and skills touched by the change.

## Checklist

1. Inspect `git status --short`.
2. Summarize changed product surfaces and migration boundaries.
3. Run targeted validation:
   - `npm run test:local` when local tooling changed;
   - `npm run typecheck` for TypeScript changes;
   - `npm run lint` for web changes;
   - relevant Python agent tests for `agent/` changes.
4. Check whether docs, decisions, contracts, OpenSpec, or skills need updates.
5. Check that no secrets, customer data, recordings, or real transcripts are committed.
6. Produce a concise PR summary with validation evidence and remaining risk.

## Output

Use:

```markdown
## Summary
- ...

## Validation
- ...

## Docs/Specs
- ...

## Risks
- ...
```

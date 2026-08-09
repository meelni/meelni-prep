---
name: meelni-engineering-memory
description: Maintain Meelni engineering memory, including decisions, architecture docs, contracts, operations docs, OpenSpec artifacts, current-state docs, and indexes for future coding agents.
---

# Meelni Engineering Memory

Use this skill when a change accepts, implies, or revises durable engineering truth.

## Read First

- `AGENTS.md`
- `docs/decisions/current.md`
- `docs/decisions/decision-log.md`
- Relevant files in `docs/architecture/`, `docs/contracts/`, `docs/operations/`, and `openspec/`

## When To Update Memory

Update durable memory for:

- package/module boundary decisions;
- provider adapter contracts;
- LiveKit/session lifecycle behavior;
- transcript, feedback, question, billing, or analytics payload contracts;
- local tooling, deployment, environment, validation, or runbook changes;
- accepted product/engineering tradeoffs that future agents should not rediscover.

Do not create decision records for routine implementation details or obvious cleanup.

## Workflow

1. Separate accepted facts from open questions.
2. Choose the smallest artifact: decision, architecture doc, contract, operations doc, or OpenSpec change/spec.
3. Update indexes.
4. Verify docs do not describe planned behavior as shipped.

## Output

Use:

```markdown
## Engineering Memory

- Decision records:
- Architecture docs:
- Contracts:
- Operations docs:
- OpenSpec:
- Indexes updated:

## Open Questions

- ...
```

---
name: meelni-codebase-architecture
description: Use when reviewing or improving Meelni architecture, package boundaries, module seams, provider adapters, testability, monorepo migration, or maintainability.
---

# Meelni Codebase Architecture

Use this skill for architecture review, package migration, adapter boundaries, and changes that make Meelni easier for humans and agents to evolve. Treat architecture work as evidence-led design, not file shuffling.

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

## Design Vocabulary

Use these terms when making architecture claims:

- **Module**: route, workflow, service, package, React component, Python runtime helper, or function with an interface and implementation.
- **Interface**: every fact callers must know: types, invariants, ordering, auth, errors, persistence effects, provider behavior, and performance.
- **Deep module**: small interface with meaningful behavior behind it.
- **Shallow module**: interface is nearly as complex as the implementation; often a pass-through wrapper.
- **Seam**: where behavior can vary without changing callers.
- **Adapter**: provider-specific implementation behind a seam.
- **Locality**: how much a change, bug, or test stays in one place.

Keep Meelni's existing names. Use this vocabulary to reason about design, not to rename the codebase.

## Staff-Level Review Gates

### Boundary Quality

- Does the change move repeated caller knowledge inward, or spread new rules across call sites?
- Are app routes/pages still thin, or did product logic leak into entrypoints?
- Is provider behavior normalized once before entering core behavior?
- Are public package entrypoints enough for consumers, or did the diff add deep imports?
- Did the PR create a real seam with at least one current reason to vary, or a speculative abstraction?

### Complexity And Code Quality

- Look for a simpler reframing that deletes branches, modes, helper layers, or duplicated concepts.
- Treat ad hoc conditionals in busy flows as design smells, not style nits.
- Question files pushed toward or beyond 1000 lines unless their organization is unusually cohesive.
- Flag wrappers, adapters, and helpers that do not shrink the caller's interface.
- Prefer direct boring code over clever generic mechanisms.
- Push casts, `any`, optional fields, and silent fallbacks back to explicit typed boundaries.

### Migration Safety

- Preserve the root Next.js app until the staged `apps/web` migration is ready.
- Move stable contracts before moving routes or pages.
- Make each migration slice independently shippable and reversible.
- Keep provider-specific code behind `packages/integrations` or local adapter boundaries until a package seam is earned.
- Do not mix behavior change with broad file relocation unless the user explicitly asked for that combined risk.

### Test Surface

- Tests should cross the same seam callers use.
- If tests must reach around a module, the module interface may be wrong.
- Prefer behavior tests over source-shape tests unless guarding migration or design-system conventions.
- A good architecture move should make at least one future test easier to write, faster to run, or more meaningful.

## Candidate Quality Bar

Only present a migration or refactor candidate when you have concrete evidence:

- files and callers involved;
- current interface callers must understand;
- behavior, state, or provider knowledge leaking across the seam;
- complexity that would become local or disappear;
- test impact;
- rollout risk;
- decision or contract conflict, if any.

Mark confidence:

- **Strong**: repeated evidence across callers, tests, or bugs.
- **Worth exploring**: clear friction with a plausible improvement.
- **Speculative**: interesting but not enough evidence for implementation.

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
- Complexity deleted or made local:
- Test impact:
- Risk:
- Confidence:

## Recommendation

- First move:
- Validation:
```

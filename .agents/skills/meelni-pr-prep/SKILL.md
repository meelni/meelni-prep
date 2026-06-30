---
name: meelni-pr-prep
description: Use when preparing, reviewing, opening, updating, or finalizing a meaningful Meelni PR or PR-ready branch.
---

# Meelni PR Prep

Use this skill before opening, updating, or finalizing a meaningful Meelni PR. Treat PR prep as a staff-level engineering closeout: prove the branch is scoped, understandable, tested, operationally safe, and honest about remaining risk.

## Read First

- `AGENTS.md`
- `docs/operations/tooling.md`
- `docs/decisions/current.md`
- `.agents/skills/meelni-linear-workstream/SKILL.md`
- Relevant docs, contracts, specs, and skills touched by the change.

## Core Stance

Do not rubber-stamp. A good PR prep answer says exactly what changed, why it is bounded, what evidence exists, what still worries you, and what the reviewer should focus on. Prefer one clearly stated risk over a vague "looks good."

Do not broaden the product beyond PM interview prep. Preserve the root Next.js app until the staged `apps/web` migration is ready.

## Phase 1: Diff Orientation

1. Inspect branch state:
   - `git status --short`
   - `git diff --stat`
   - `git diff --name-only`
   - untracked files that must be included or intentionally excluded.
2. Identify the PR category:
   - product behavior;
   - frontend/UI;
   - backend/API/workflow;
   - LiveKit/Python agent/runtime;
   - feedback/evaluation;
   - question bank/SEO/content;
   - billing/entitlements;
   - local tooling/agent experience;
   - docs-only.
3. Summarize blast radius:
   - user-facing surfaces;
   - provider boundaries: Supabase, LiveKit, Stripe, Inngest, PostHog, Google Sheets;
   - migration boundaries: root app vs future `apps/web`, package public entrypoints, provider adapters;
   - data shape or contract changes;
   - rollout, compatibility, and rollback concerns.

## Phase 2: Engineering Review Gates

Run the relevant gates for the diff. Record "not applicable" only when the category truly does not apply.

### Architecture And Boundaries

- App routes/pages stay thin: parse, authenticate, call workflow, map response.
- Shared PM interview behavior belongs in `packages/core` when it is stable enough to become a domain contract.
- Provider-specific code stays behind integration boundaries and normalizes external payloads before core behavior.
- No deep imports across package boundaries; use public entrypoints.
- New abstractions remove real duplication or clarify a migration boundary; they are not speculative.
- Existing root Next.js app remains intact unless the PR explicitly targets the staged migration.

### Backend, Data, And Jobs

- Inputs are parsed with typed schemas or structured helpers, not ad hoc string checks.
- Auth, entitlement, and ownership checks happen before mutation or sensitive reads.
- Mutations are idempotent where retries/webhooks/background jobs can repeat.
- Inngest and webhook handlers tolerate retries, partial failure, and stale external state.
- Database changes include migration intent, backwards compatibility, and rollback notes.
- Error handling avoids leaking secrets or raw provider payloads.

### Frontend And Product UX

- Use `meelni-ui-design-system` as the primary UI review lens when the branch touches pages, components, styling, motion, visual states, or design primitives.
- The first screen is the actual usable experience, not a marketing detour, unless the route is explicitly marketing.
- UI follows existing primitives and design-system conventions.
- Empty, loading, error, disabled, optimistic, and permission-denied states are accounted for when user-facing.
- Text fits at mobile and desktop sizes; controls do not resize unexpectedly under dynamic content.
- Accessibility basics are covered: semantic controls, labels, focus order, keyboard path, and non-color-only status.
- Copy is PM interview-prep specific and does not expose provider/model tuning as end-user controls without an accepted decision.

### LiveKit And Interview Runtime

- Room metadata, agent names, transcript events, and session lifecycle payloads match `packages/agent` and `packages/integrations` contracts.
- Runtime helpers are tested directly; manual LiveKit verification is called out when required but not run.
- Turn-taking, transcript persistence, and interview end/feedback handoff failure paths are explicit.
- No recordings, transcripts, customer data, or provider credentials are committed.

### Feedback, Evaluation, And Content

- Rubric/scoring changes use fixtures or regression examples.
- Feedback behavior is PM-calibrated, actionable, and not generic coaching filler.
- Question-bank or SEO changes preserve structured data, canonical paths, content-to-practice conversion, and company/question taxonomy.
- Generated or imported content is reviewed for product fit and does not create fake customer/company claims.

### Security, Privacy, And Compliance

- Secret scan the diff and untracked files for API keys, database URLs, JWTs, transcripts, recordings, customer data, and provider credentials.
- Client/server boundaries are respected: server-only secrets do not reach client bundles or public env names.
- Webhook signatures, auth callbacks, and redirect targets are not weakened.
- Logs and errors redact sensitive values.
- Production guardrails are explicit for Stripe, Vercel envs, LiveKit Cloud agents, and database migrations.

### Testing Strategy

- Tests prove behavior, not source shape, unless guarding architecture/tooling conventions.
- New failure modes become fixtures or regression tests when possible.
- Riskier changes have narrower targeted tests plus one broader validation command.
- If a command fails from known unrelated baseline debt, capture exact failing tests/files and explain why the PR does not own them.
- If manual verification is required, list the exact scenario, URL/command, env prerequisites, and what result to observe.

## Phase 3: Required Validation

Choose commands by touched surface:

- Local tooling or skills: `npm run test:local`, `npm run validate:skills`, `npm run doctor`.
- TypeScript app/packages: `npm run typecheck`.
- Web/UI behavior: `npm run lint` and targeted browser/manual check when visual behavior changed.
- Package contracts: relevant `npm run test:core`, `npm run test:agent`, `npm run test:integrations`, `npm run test:fixtures`, `npm run test:packages`.
- Workflows: `npm run test:workflows`.
- Billing: `npm run test:billing`; Stripe CLI/scripts only when test-mode credentials are configured.
- Python agent: `npm run test:python-agent` when `agent/venv` exists or explain skip.
- Meaningful PR closeout: `npm run verify:agent` when feasible; otherwise list the narrower commands and why full verification was not run.

## Phase 4: Docs, Specs, And Tracking

Check whether the branch needs any of these, and say why:

- Docs: operations, architecture, contracts, integrations, development/testing, README.
- Decisions: accepted architecture/product/provider tradeoffs in `docs/decisions/`.
- OpenSpec: meaningful behavior changes where alignment matters.
- Skills: reusable agent workflow or provider knowledge.
- Linear: issue has current state, verification evidence, pending PR link/note, and remaining follow-up work.

Do not create decision records for routine implementation details. Do update durable memory for local tooling, deployment, provider setup, contracts, and accepted tradeoffs future agents should not rediscover.

## Phase 5: PR Body Quality

Draft or verify a PR body that a reviewer can act on quickly:

```markdown
## Summary
- What changed, in product/engineering language
- Why this scope is bounded
- Any migration/provider boundary touched

## Validation
- Command/result pairs
- Known unrelated failures with exact files/tests
- Manual checks, if any

## Docs/Specs
- Docs/decisions/contracts/OpenSpec/skills updated
- Explicitly "none needed" with rationale when appropriate

## Risks
- Remaining correctness, UX, operational, data, or rollout risks
- Follow-up issue/Linear ID, if applicable
```

Add reviewer notes for risky areas: auth/permissions, data migrations, billing, LiveKit runtime, feedback scoring, provider envs, or visual regressions.

## Final Output

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

Include the Linear issue identifier when one exists. If there is no issue, state that plainly.

## Common Mistakes

- Calling a branch "PR-ready" when validation failed without explaining ownership of the failure.
- Listing commands without results.
- Forgetting untracked files, generated files, or stale docs.
- Treating UI changes as only TypeScript changes; visual behavior still needs design/UX review.
- Treating backend changes as only unit-test work; auth, idempotency, retry behavior, and observability matter.
- Moving fast past Linear, docs, or decision updates and leaving future agents to rediscover the same context.

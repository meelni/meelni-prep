---
name: meelni-vertical-slice-playbooks
description: Use when building, modifying, scoping, or reviewing a Meelni feature by vertical slice, especially interview/session flows, billing or trials, feedback/evaluation, question-bank SEO, dashboards, or cross-layer product changes that need coordinated app, package, test, and docs updates.
---

# Meelni Vertical Slice Playbooks

Use this skill to move quickly without scattering changes. A vertical slice should have one clear user or operator outcome, one workflow owner, targeted tests, and only the docs needed to preserve decisions. Do not treat a slice as "touch every layer"; touch only the layers needed for the outcome.

## Start

- Read `AGENTS.md`, `docs/architecture/target-monorepo.md`, and `docs/operations/tooling.md`.
- Pick the closest slice below before editing.
- For meaningful product or engineering changes, fill or mentally answer `docs/templates/AGENT_TASK_INTAKE.md` before implementation.
- Keep app routes thin: authenticate, parse input, call a workflow, map response.
- Prefer package exports from `@meelni/core`, `@meelni/agent`, and `@meelni/integrations` for durable contracts.
- Run `npm run verify:agent` before opening or merging meaningful changes.

## Slice Gate

Before editing, state:

- user/operator outcome;
- primary workflow owner;
- layers in scope and out of scope;
- provider dependencies;
- data or contract changes;
- expected validation;
- rollout or rollback risk.

If the answer is "many unrelated outcomes," split the work. If the answer is "only cleanup," use `meelni-codebase-architecture` instead.

## Implementation Gates

### Product And UX

- The first changed surface should help the target user complete the actual workflow.
- Use `meelni-ui-design-system` for UI components, pages, styling, motion, responsive states, prototypes, and visual guardrail work.
- Include empty, loading, error, permission, and recovery states when user-facing.
- Preserve PM interview prep focus; do not generalize to broad coaching or every profession.
- Do not expose model/provider tuning as a user control unless accepted by product strategy.

### Backend And Data

- Auth, ownership, entitlement, and rate/usage checks happen before sensitive reads or writes.
- External payloads normalize before core workflows.
- Background jobs, webhooks, and retries are idempotent or safely resumable.
- Data shape changes include compatibility and migration/rollback notes.

### Architecture

- Keep entrypoints thin and behavior in workflows or packages.
- Use package public entrypoints; avoid deep imports.
- Move stable contracts before moving pages/routes.
- Add abstractions only when they remove current duplication or clarify a real migration boundary.

### Tests And Verification

- Prefer behavior tests at the workflow seam.
- Add fixtures for real interview, transcript, feedback, billing, or LiveKit failures.
- Run targeted commands while iterating, then broader validation before PR prep.
- Record known unrelated failures with exact files/tests.

### Docs And Tracking

- Update docs only when durable behavior, setup, contracts, provider operations, or decisions changed.
- Use `meelni-engineering-memory` for decisions/contracts/operations notes.
- Use `meelni-linear-workstream` for meaningful Linear-tracked work; keep verification evidence there when possible.

## Slice: Interview Session

Use for setup, start/end session, LiveKit room metadata, transcript capture, usage counting, interview config, and the `/interview` experience.

Read:

- `app/api/session/start/route.ts`
- `app/api/interview/end/route.ts`
- `app/interview/page.tsx`
- `components/interview/`
- `packages/agent/src/`
- `packages/core/src/interview.ts`
- `packages/core/src/session.ts`
- `packages/integrations/src/livekit.ts`

Validate:

- `npm run test:core`
- `npm run test:agent`
- `npm run test:integrations`
- `npm run build`

## Slice: Feedback And Evaluation

Use for scoring, rubrics, feedback generation, drills, transcript quality, insights, and feedback UI.

Read:

- `lib/evaluation/`
- `lib/inngest/functions/generate-feedback.ts`
- `app/api/feedback/`
- `app/feedback/`
- `components/feedback/`
- `packages/core/src/evaluation.ts`
- `.agents/skills/meelni-feedback-evaluation/SKILL.md`

Validate:

- Add or update transcript and feedback fixtures when behavior changes.
- `npm run test:core`
- Targeted tests under `lib/evaluation/` or `lib/inngest/` when available.
- `npm run build`

## Slice: Billing, Trials, And Entitlements

Use for subscriptions, seven-day trials, usage limits, Stripe flows, permissions, and plan packaging.

Read:

- `app/api/billing/`
- `app/api/checkout/`
- `app/api/customer-portal/`
- `app/api/webhooks/stripe/route.ts`
- `lib/services/permissions-service.ts`
- `lib/services/permissions-service.server.ts`
- `lib/services/usage-service.ts`
- `packages/core/src/entitlements.ts`
- `docs/integrations/stripe/`

Validate:

- Add contract tests in `packages/core/src/contracts.test.ts` for entitlement changes.
- Run `npm run test:core`.
- Run targeted Stripe scripts only when credentials and test mode are configured.
- Run `npm run build`.

## Slice: Question Bank And SEO

Use for explore pages, company pages, public question surfaces, content-to-practice conversion, structured data, and Google Sheets sync.

Read:

- `app/explore/`
- `app/companies/`
- `app/api/questions/`
- `components/explore/`
- `components/question-bank/`
- `lib/data/companies`
- `scripts/sync-questions-from-sheet.ts`
- `.agents/skills/meelni-question-bank-seo/SKILL.md`

Validate:

- `npm run test:local`
- `npm run build`
- Google Sheets scripts only when credentials are configured.

## Slice: Agent Experience And Tooling

Use for skills, agent docs, local setup, verification commands, conductor setup, and PR workflow improvements.

Read:

- `.agents/skills/`
- `AGENTS.md`
- `DESIGN.md`
- `docs/operations/skills.md`
- `docs/operations/tooling.md`
- `scripts/doctor-local.mjs`
- `scripts/verify-agent.mjs`
- `scripts/validate-skills.mjs`

Validate:

- `npm run validate:skills`
- `npm run verify:agent`

## Output

When proposing or completing a slice, include:

- slice chosen;
- files touched by layer;
- package or workflow boundary used;
- tests run;
- docs or decisions updated;
- follow-up slice, if any.
